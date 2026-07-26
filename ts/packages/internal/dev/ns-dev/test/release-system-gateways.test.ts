import { relative, resolve } from "node:path";

import { createFakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
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

import { releaseInventoryFixture } from "./release-transaction-builders.ts";

import { repoRoot, type PublicPackageContext } from "../src/public-packages/package-set.ts";
import { createSystemReleaseCliContext } from "../src/release-public-package-set-cli.ts";
import type { OptionalResult, ReleaseTransactionReport } from "../src/release/contracts.ts";
import {
	createSystemFreshReleaseGateway,
	createSystemNpmRegistryGateway,
	createSystemReleaseCommandGateway,
	createSystemReleaseResetGateway,
	type ReleaseResetFileOperations,
} from "../src/release/system.ts";

const releaseBranch = "transactional-npm-release/v1.2.3";
const releaseVersion = "1.2.3";
const headCommit = "a".repeat(40);
const releaseDirectory = resolve(repoRoot, `ts/dist/releases/${releaseVersion}`);
const reportPath = resolve(releaseDirectory, "report.json");

function packageContextFixture(): PublicPackageContext {
	const packageManifests = releaseInventoryFixture.map((name, index) => ({
		path: resolve(repoRoot, `ts/packages/package-${index}/package.json`),
		root: resolve(repoRoot, `ts/packages/package-${index}`),
		manifest: { name, version: "1.2.3" },
	}));
	return {
		workspaceManifest: {},
		workspaceYaml: "",
		packageManifests,
		manifestByName: new Map(packageManifests.map((entry) => [entry.manifest.name, entry])),
		releaseInventory: releaseInventoryFixture,
	};
}

function manifestPath(index: number): string {
	return `ts/packages/package-${index}/package.json`;
}

class InMemoryReleaseResetFiles implements ReleaseResetFileOperations {
	readonly texts = new Map<string, string>();
	readonly directoryFingerprints = new Map<string, string>();
	readonly removedPaths: string[] = [];

	async readText(path: string): Promise<string> {
		const contents = this.texts.get(path);
		if (contents === undefined) throw new Error(`missing fixture: ${path}`);
		return contents;
	}

	async fingerprintDirectory(path: string): Promise<string | null> {
		return this.directoryFingerprints.get(path) ?? null;
	}

	async removeDirectory(path: string): Promise<void> {
		this.removedPaths.push(path);
		this.directoryFingerprints.delete(path);
	}
}

function resetFiles(changedIndexes: readonly number[] = []): InMemoryReleaseResetFiles {
	const changed = new Set(changedIndexes);
	const files = new InMemoryReleaseResetFiles();
	for (const [index, name] of releaseInventoryFixture.entries()) {
		files.texts.set(
			resolve(repoRoot, manifestPath(index)),
			`${JSON.stringify({ version: changed.has(index) ? releaseVersion : "1.2.2", name }, null, "\t")}\n`,
		);
	}
	return files;
}

function resetInspectionScript(
	status: string = "",
	branchRefResult: ExecResult = exitedResult({ code: 1 }),
	ancestryResult?: ExecResult,
): ReturnType<typeof step>[] {
	return [
		step("git", ["branch", "--show-current"], exitedResult({ stdout: "feature/release\n" })),
		step("git", ["rev-parse", "HEAD"], exitedResult({ stdout: `${headCommit}\n` })),
		step(
			"git",
			["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
			branchRefResult,
		),
		step(
			"git",
			["status", "--porcelain=v1", "-z", "--untracked-files=all"],
			exitedResult({ stdout: status }),
		),
		...releaseInventoryFixture.map((name, index) =>
			step(
				"git",
				["show", `HEAD:${manifestPath(index)}`],
				exitedResult({ stdout: JSON.stringify({ version: "1.2.2", name }) }),
			),
		),
		...(ancestryResult === undefined
			? []
			: [step("git", ["merge-base", "--is-ancestor", headCommit, "HEAD"], ancestryResult)]),
	];
}

function releaseReport(): ReleaseTransactionReport {
	return {
		schemaVersion: 1,
		release: {
			branch: "feature/release",
			commit: headCommit,
			version: releaseVersion,
		},
		inventory: [...releaseInventoryFixture],
		candidates: [],
		completedWrites: [],
		pendingWrite: null,
		stage: "preparing-candidates",
	};
}

function reportStore(result: OptionalResult<ReleaseTransactionReport>, paths: string[]) {
	return {
		async read(path: string): Promise<OptionalResult<ReleaseTransactionReport>> {
			paths.push(path);
			return result;
		},
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
			interaction: createFakeClinkrInteraction().interaction,
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

	it("streams release subprocess stderr through the CLI status channel", async () => {
		const status: string[] = [];
		const context = createSystemReleaseCliContext({
			env: {},
			interaction: createFakeClinkrInteraction().interaction,
			runCommand: async (_command, _args, options) => {
				options?.onStderr?.("checking package...\n");
				return exitedResult();
			},
			status: (text) => status.push(text),
			timers: createManualTimerScheduler().timers,
		});

		expect(await context.release.bumpCoordinatedVersion(releaseVersion)).toEqual({ ok: true });
		expect(status).toEqual(["checking package...\n"]);
	});

	it("forwards pnpm script arguments without an extra separator", async () => {
		const commands = new ScriptedCommandRunner([
			step("pnpm", ["--dir", "ts", "run", "release:bump-version", "1.2.3"], exitedResult()),
			step("pnpm", ["--dir", "ts", "run", "release:qualify-public", "-v", "1.2.3"], exitedResult()),
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

	it("inspects reset state with NUL-safe staged, worktree, unexpected, and exact-directory evidence", async () => {
		const files = resetFiles([0, 1, 2]);
		files.directoryFingerprints.set(releaseDirectory, "complete-directory-fingerprint");
		const exactReleaseDirectoryStatusPath = `${relative(repoRoot, releaseDirectory)}/`;
		const status = [
			`M  ${manifestPath(0)}`,
			` M ${manifestPath(1)}`,
			`MM ${manifestPath(2)}`,
			" M ts/pnpm-lock.yaml",
			"D  README.md",
			"R  renamed.md",
			"README-old.md",
			"?? scratch notes.txt",
			`?? ${exactReleaseDirectoryStatusPath}`,
			"",
		].join("\0");
		const commands = new ScriptedCommandRunner(resetInspectionScript(status));
		const readReportPaths: string[] = [];
		const gateway = createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: files,
			reportStore: reportStore({ type: "missing" }, readReportPaths),
		});

		const result = await gateway.inspectResetState({
			version: releaseVersion,
			releaseBranch,
		});

		expect(result).toMatchObject({
			ok: true,
			value: {
				currentSourceBranch: "feature/release",
				headCommit,
				releaseBranch,
				releaseBranchExists: false,
				releaseDirectory,
				releaseDirectoryFingerprint: "complete-directory-fingerprint",
				report: { type: "missing" },
				untrackedPaths: ["scratch notes.txt"],
				trackedChanges: [
					{ path: manifestPath(0), indexChanged: true, worktreeChanged: false },
					{ path: manifestPath(1), indexChanged: false, worktreeChanged: true },
					{ path: manifestPath(2), indexChanged: true, worktreeChanged: true },
					{ path: "ts/pnpm-lock.yaml", indexChanged: false, worktreeChanged: true },
					{
						path: "README.md",
						indexChanged: true,
						worktreeChanged: false,
						isUnexpectedStatus: true,
					},
					{
						path: "renamed.md",
						indexChanged: true,
						worktreeChanged: false,
						isUnexpectedStatus: true,
					},
				],
			},
		});
		if (result.ok) {
			expect(result.value.manifests[0]).toMatchObject({
				packageName: releaseInventoryFixture[0],
				path: manifestPath(0),
				headVersion: "1.2.2",
				workingVersion: releaseVersion,
				changedFields: ["version"],
				isExactVersionOnlyChange: true,
			});
			expect(result.value.manifests).toHaveLength(releaseInventoryFixture.length);
		}
		expect(readReportPaths).toEqual([reportPath]);
		expect(commands.calls.every((call) => call.cwd === repoRoot)).toBe(true);
		expect(commands.calls.map((call) => call.command)).not.toContain("gt");
		expect(commands.calls.map((call) => call.command)).not.toContain("npm");
		commands.assertDone();
	});

	it.each([
		["missing", { type: "missing" }, { type: "missing" }],
		[
			"found",
			{ type: "found", value: releaseReport() },
			{ type: "found", report: releaseReport(), isCommitAncestorOfHead: true },
		],
		[
			"unreadable",
			{
				type: "error",
				error: { code: "report-read-failed", message: "read failed fixture" },
			},
			{
				type: "error",
				errorType: "read-error",
				error: { code: "report-read-failed" },
			},
		],
		[
			"invalid",
			{
				type: "error",
				error: { code: "report-invalid", message: "invalid report fixture" },
			},
			{
				type: "error",
				errorType: "parse-error",
				error: { code: "report-invalid" },
			},
		],
	] as const)("preserves %s reset report state", async (label, reportResult, expectedReport) => {
		const commands = new ScriptedCommandRunner(
			resetInspectionScript(
				"",
				exitedResult({ code: 1 }),
				label === "found" ? exitedResult() : undefined,
			),
		);
		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: resetFiles(),
			reportStore: reportStore(reportResult, []),
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({ ok: true, value: { report: expectedReport } });
		commands.assertDone();
	});

	it("marks semantically version-only but byte-inexact manifests unsafe", async () => {
		const files = resetFiles([0]);
		files.texts.set(
			resolve(repoRoot, manifestPath(0)),
			JSON.stringify({ name: releaseInventoryFixture[0], version: releaseVersion }),
		);
		const commands = new ScriptedCommandRunner(resetInspectionScript());
		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: files,
			reportStore: reportStore({ type: "missing" }, []),
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.value.manifests[0]).toMatchObject({
				changedFields: ["version"],
				isExactVersionOnlyChange: false,
			});
		}
		commands.assertDone();
	});

	it("records unrelated report commit ancestry from the safe merge-base command", async () => {
		const commands = new ScriptedCommandRunner(
			resetInspectionScript("", exitedResult({ code: 1 }), exitedResult({ code: 1 })),
		);
		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: resetFiles(),
			reportStore: reportStore({ type: "found", value: releaseReport() }, []),
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({
			ok: true,
			value: { report: { type: "found", isCommitAncestorOfHead: false } },
		});
		commands.assertDone();
	});

	it("returns command evidence when a full report commit cannot be resolved", async () => {
		const commands = new ScriptedCommandRunner(
			resetInspectionScript(
				"",
				exitedResult({ code: 1 }),
				exitedResult({ code: 128, stderr: "fatal: Not a valid commit name" }),
			),
		);
		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: resetFiles(),
			reportStore: reportStore({ type: "found", value: releaseReport() }, []),
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "release-command-failed",
				displayCommand: `git merge-base --is-ancestor ${headCommit} HEAD`,
				details: {
					args: ["merge-base", "--is-ancestor", headCommit, "HEAD"],
					resultType: "exited",
					exitCode: 128,
				},
			},
		});
		commands.assertDone();
	});

	it("rejects a non-full report commit before invoking git merge-base", async () => {
		const invalidReport = releaseReport();
		const commands = new ScriptedCommandRunner(resetInspectionScript());
		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
			loadPackageContext: async () => packageContextFixture(),
			fileOperations: resetFiles(),
			reportStore: reportStore(
				{
					type: "found",
					value: {
						...invalidReport,
						release: { ...invalidReport.release, commit: "not-a-full-object-id" },
					},
				},
				[],
			),
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "release-report-commit-invalid" },
		});
		expect(commands.calls.some((call) => call.args.includes("merge-base"))).toBe(false);
		commands.assertDone();
	});

	it("preserves reset command failure evidence", async () => {
		const commands = new ScriptedCommandRunner([
			step("git", ["branch", "--show-current"], exitedResult({ stdout: "feature/release\n" })),
			step("git", ["rev-parse", "HEAD"], exitedResult({ stdout: "abc123\n" })),
			step(
				"git",
				["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
				timedOutResult({ signal: "SIGKILL" }),
			),
		]);

		const result = await createSystemReleaseResetGateway({
			runCommand: commands.runner,
		}).inspectResetState({ version: releaseVersion, releaseBranch });

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "release-command-failed",
				displayCommand: `git show-ref --verify --quiet refs/heads/${releaseBranch}`,
				details: {
					command: "git",
					args: ["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
					resultType: "timed-out",
				},
			},
		});
		commands.assertDone();
	});

	it("restores sorted exact paths and removes only the supplied release directory", async () => {
		const commands = new ScriptedCommandRunner([
			step(
				"git",
				["restore", "--staged", "--worktree", "--", manifestPath(1), manifestPath(3)],
				exitedResult(),
			),
		]);
		const files = resetFiles();
		files.directoryFingerprints.set(releaseDirectory, "complete-directory-fingerprint");
		const gateway = createSystemReleaseResetGateway({
			runCommand: commands.runner,
			fileOperations: files,
		});

		expect(await gateway.restoreTrackedReleasePaths([manifestPath(3), manifestPath(1)])).toEqual({
			ok: true,
		});
		expect(
			await gateway.removeReleaseDirectory({
				version: releaseVersion,
				plannedPath: releaseDirectory,
			}),
		).toEqual({ ok: true });
		expect(
			await gateway.removeReleaseDirectory({
				version: releaseVersion,
				plannedPath: resolve(repoRoot, "ts/dist/releases/another-version"),
			}),
		).toMatchObject({ ok: false, error: { code: "release-directory-target-mismatch" } });
		expect(files.removedPaths).toEqual([releaseDirectory]);
		expect(commands.calls.map((call) => call.command)).toEqual(["git"]);
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
