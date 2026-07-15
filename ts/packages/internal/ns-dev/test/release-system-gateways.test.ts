import { resolve } from "node:path";

import type { ExecResult } from "@nseng-ai/foundation/exec";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import {
	cancelledResult,
	exitedResult,
	ScriptedCommandRunner,
	spawnFailedResult,
	step,
	timedOutResult,
} from "@nseng-ai/foundation/exec/testing";
import { describe, expect, it } from "vitest";

import {
	intendedPublicPackages,
	repoRoot,
	type PublicPackageContext,
} from "../src/public-packages/package-set.ts";
import { createSystemReleaseCliContext } from "../src/release-public-package-set-cli.ts";
import {
	createSystemFreshReleaseGateway,
	createSystemNpmRegistryGateway,
	createSystemReleaseCommandGateway,
} from "../src/release/system.ts";

const releaseBranch = "transactional-npm-release/v1.2.3";

function packageContextFixture(): PublicPackageContext {
	const packageManifests = intendedPublicPackages.map((name, index) => ({
		path: resolve(repoRoot, `ts/packages/package-${index}/package.json`),
		root: resolve(repoRoot, `ts/packages/package-${index}`),
		manifest: { name, version: "1.2.3" },
	}));
	return {
		workspaceManifest: {},
		workspaceYaml: "",
		packageManifests,
		manifestByName: new Map(packageManifests.map((entry) => [entry.manifest.name, entry])),
	};
}

function freshStateScript(
	gtTrunkResult: ExecResult = exitedResult({ stdout: "main\n" }),
	branchRefResult: ExecResult = exitedResult({ code: 1 }),
) {
	return [
		step("git", ["branch", "--show-current"], exitedResult({ stdout: "feature/release\n" })),
		step("git", ["rev-parse", "HEAD"], exitedResult({ stdout: "abc123\n" })),
		step("gt", ["trunk", "--no-interactive"], gtTrunkResult),
		step("git", ["status", "--porcelain=v1", "--untracked-files=all"], exitedResult()),
		step(
			"git",
			["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
			branchRefResult,
		),
		step("gt", ["parent", "--no-interactive"], exitedResult({ code: 1 })),
	];
}

describe("release system command gateways", () => {
	it("waits through the injected timer scheduler", async () => {
		const manual = createManualTimerScheduler();
		const context = createSystemReleaseCliContext({
			env: {},
			runCommand: async () => exitedResult(),
			timers: manual.timers,
		});
		const waiting = context.delay.wait(2_500);

		expect(manual.pendingTimerCount()).toBe(1);
		manual.advanceMs(2_499);
		expect(manual.pendingTimerCount()).toBe(1);
		manual.advanceMs(1);
		await waiting;
		expect(manual.pendingTimerCount()).toBe(0);
	});

	it("forwards pnpm script arguments without an extra separator", async () => {
		const commands = new ScriptedCommandRunner([
			step("pnpm", ["--dir", "ts", "run", "release:bump-version", "1.2.3"], exitedResult()),
			step(
				"pnpm",
				["--dir", "ts", "run", "release:qualify-public", "-a", "-v", "1.2.3"],
				exitedResult(),
			),
			step(
				"pnpm",
				["--dir", "ts", "run", "release:verify-public", "-v", "1.2.3", "-s", "-c", "report.json"],
				exitedResult(),
			),
		]);
		const freshGateway = createSystemFreshReleaseGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
		});
		const releaseGateway = createSystemReleaseCommandGateway({ runCommand: commands.runner });

		expect(await freshGateway.bumpCoordinatedVersion("1.2.3")).toEqual({ ok: true });
		expect(await freshGateway.qualifyPublicPackages("1.2.3")).toMatchObject({ ok: true });
		expect(
			await releaseGateway.verify({
				version: "1.2.3",
				candidateReportPath: "report.json",
			}),
		).toEqual({ ok: true });
		commands.assertDone();
	});

	it("reports a missing gt executable as a spawn failure", async () => {
		const commands = new ScriptedCommandRunner(
			freshStateScript(spawnFailedResult(new Error("spawn gt ENOENT"))),
		);
		const result = await createSystemFreshReleaseGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
		}).inspectFreshState(releaseBranch);

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "release-command-failed",
				displayCommand: "gt trunk --no-interactive",
				details: { resultType: "spawn-failed", spawnError: "spawn gt ENOENT" },
			},
		});
		commands.assertDone();
	});

	it("does not mistake a show-ref spawn failure for an absent branch", async () => {
		const commands = new ScriptedCommandRunner(
			freshStateScript(
				exitedResult({ stdout: "main\n" }),
				spawnFailedResult(new Error("spawn git ENOENT")),
			),
		);
		const result = await createSystemFreshReleaseGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
		}).inspectFreshState(releaseBranch);

		expect(result).toMatchObject({
			ok: false,
			error: { details: { resultType: "spawn-failed" } },
		});
		commands.assertDone();
	});

	it("tolerates only proven show-ref and Graphite parent exits", async () => {
		const commands = new ScriptedCommandRunner(freshStateScript());
		const result = await createSystemFreshReleaseGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
		}).inspectFreshState(releaseBranch);

		expect(result).toMatchObject({
			ok: true,
			value: { releaseBranchExists: false, isGraphiteTracked: false },
		});
		commands.assertDone();
	});

	it("classifies npm E404 as missing only for an exited command", async () => {
		const missingCommands = new ScriptedCommandRunner([
			step(
				"npm",
				["view", "@nseng-ai/example@1.2.3", "dist.integrity", "dist.shasum", "--json"],
				exitedResult({ code: 1, stderr: "npm error code E404" }),
			),
		]);
		expect(
			await createSystemNpmRegistryGateway({
				runCommand: missingCommands.runner,
			}).readPackageMetadata("@nseng-ai/example", "1.2.3"),
		).toEqual({ type: "missing" });
		missingCommands.assertDone();

		const spawnCommands = new ScriptedCommandRunner([
			step(
				"npm",
				["view", "@nseng-ai/example@1.2.3", "dist.integrity", "dist.shasum", "--json"],
				spawnFailedResult(new Error("E404-shaped spawn failure")),
			),
		]);
		const spawnResult = await createSystemNpmRegistryGateway({
			runCommand: spawnCommands.runner,
		}).readPackageMetadata("@nseng-ai/example", "1.2.3");
		expect(spawnResult).toMatchObject({
			type: "error",
			error: { details: { resultType: "spawn-failed" } },
		});
		spawnCommands.assertDone();
	});

	it.each([
		["cancelled", cancelledResult({ signal: "SIGTERM" })],
		["timed-out", timedOutResult({ signal: "SIGKILL" })],
	] as const)("preserves %s command termination", async (resultType, commandResult) => {
		const commands = new ScriptedCommandRunner([
			step(
				"npm",
				["view", "@nseng-ai/example@1.2.3", "dist.integrity", "dist.shasum", "--json"],
				commandResult,
			),
		]);
		const result = await createSystemNpmRegistryGateway({
			runCommand: commands.runner,
		}).readPackageMetadata("@nseng-ai/example", "1.2.3");

		expect(result).toMatchObject({
			type: "error",
			error: { code: "release-command-failed", details: { resultType } },
		});
		commands.assertDone();
	});
});
