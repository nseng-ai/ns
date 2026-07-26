import { resolve } from "node:path";

import { createFakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { ScheduledTimer } from "@nseng-ai/foundation/timers";
import { TimerScheduler } from "@nseng-ai/foundation/timers";
import { describe, expect, it } from "vitest";

import { resolveVerifyDelaysMs } from "../../src/commands/public-package-workflows.ts";
import { repoRoot, workspaceRoot } from "../../src/public-packages/package-set.ts";
import { nsPublishBin } from "../../src/public-packages/ns-publish-bin.ts";
import { sdkFoldEntries, sdkPublicExports } from "../../src/public-packages/sdk-public-subpaths.ts";
import {
	createSystemReleaseCliContext,
	type ReleaseCliContext,
} from "../../src/release-public-package-set-cli.ts";
import { releaseInventoryFixture } from "../release-transaction-builders.ts";
import { exitedResult, parseJsonOutput, runScenario } from "./run-scenario.ts";

/** Fixture packages live under the `public/` disposition root, which is what makes them candidates. */
function fixtureRoot(index: number): string {
	return resolve(workspaceRoot, "packages", "public", `fixture-${index}`);
}

function packageSetFiles(version: string): Record<string, string> {
	const files: Record<string, string> = {
		[resolve(workspaceRoot, "package.json")]: JSON.stringify({ engines: { node: ">=24" } }),
		[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
		// Never a release candidate: outside `public/`, so no list has to exclude it.
		[resolve(workspaceRoot, "packages", "incubating", "flow", "package.json")]: JSON.stringify({
			name: "@nseng-ai/flow",
			version,
		}),
	};
	for (const [index, name] of releaseInventoryFixture.entries()) {
		const exports =
			name === "@nseng-ai/sdk"
				? sdkPublicExports()
				: name === "@nseng-ai/ns"
					? Object.fromEntries(
							sdkFoldEntries.map((entry) => [entry.nsExport, `./src/sdk/${entry.name}.ts`]),
						)
					: undefined;
		files[resolve(fixtureRoot(index), "package.json")] = JSON.stringify({
			name,
			version,
			...(exports === undefined ? {} : { exports }),
		});
	}
	return files;
}

const version = "1.2.3";
const qualificationCommandCount =
	releaseInventoryFixture.length * 2 + releaseInventoryFixture.length - 1 + 2 + 1;

function successfulResults(count: number): ExecResult[] {
	return Array.from({ length: count }, () => exitedResult());
}

function missingResult(): ExecResult {
	return exitedResult({ code: 1, stderr: "npm error code E404\nnpm error 404 Not Found" });
}

function terminatedResult(type: "cancelled" | "timed-out"): ExecResult {
	return { type, code: null, signal: null, stdout: "", stderr: "npm error code E404" };
}

function registryResult(
	packageName: string,
	requestedVersion = version,
	overrides: Record<string, unknown> = {},
): ExecResult {
	const index = releaseInventoryFixture.indexOf(packageName);
	const exports =
		packageName === "@nseng-ai/sdk"
			? sdkPublicExports()
			: packageName === "@nseng-ai/ns"
				? Object.fromEntries(
						sdkFoldEntries.map((entry) => [entry.nsExport, `./src/sdk/${entry.name}.ts`]),
					)
				: undefined;
	return exitedResult({
		stdout: JSON.stringify({
			name: packageName,
			version: requestedVersion,
			dist: {
				tarball: `https://registry.example/${index}.tgz`,
				integrity: `sha512-${index}`,
				shasum: `sha1-${index}`,
			},
			time: { [requestedVersion]: "2026-01-02T03:04:05.000Z" },
			...(exports === undefined ? {} : { exports }),
			// The published @nseng-ai/ns carries the bin that package preparation generates;
			// its source manifest deliberately advertises none.
			...(packageName === "@nseng-ai/ns" ? { bin: nsPublishBin } : {}),
			...overrides,
		}),
	});
}

function registryResults(requestedVersion = version): ExecResult[] {
	return releaseInventoryFixture.map((name) => registryResult(name, requestedVersion));
}

function candidateReport(requestedVersion = version): Record<string, unknown> {
	return {
		schemaVersion: 1,
		release: {
			branch: `release/${requestedVersion}`,
			commit: "release-commit",
			version: requestedVersion,
		},
		inventory: releaseInventoryFixture,
		candidates: releaseInventoryFixture.map((name, order) => ({
			name,
			version: requestedVersion,
			order,
			tarballPath: `/release/${order}.tgz`,
			integrity: `sha512-${releaseInventoryFixture.indexOf(name)}`,
			shasum: `sha1-${releaseInventoryFixture.indexOf(name)}`,
		})),
		completedWrites: releaseInventoryFixture,
		pendingWrite: null,
		stage: "published",
	};
}

function confirmingReleaseContext(confirmations: string[]): ReleaseCliContext {
	const timers = new RecordingTimerScheduler();
	const context = createSystemReleaseCliContext({
		env: { PATH: "/fake/bin" },
		interaction: createFakeClinkrInteraction().interaction,
		runCommand: async () => exitedResult(),
		timers,
	});
	return {
		...context,
		confirmation: {
			async confirmPublish(requestedVersion) {
				confirmations.push(requestedVersion);
				return { ok: true, value: true };
			},
		},
	};
}

class RecordingTimerScheduler extends TimerScheduler {
	readonly delaysMs: number[] = [];

	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		this.delaysMs.push(delayMs);
		queueMicrotask(callback);
		return { cancel() {} };
	}

	setInterval(): ScheduledTimer {
		throw new Error("Intervals are not used by public package workflows");
	}
}

function shimEnv(): NodeJS.ProcessEnv {
	return {
		NS_TEMPLATE: "/template",
		NS_OUTPUT: "/output",
		NS_TOOL: "ns tool",
		NS_CANONICAL_CHECKOUT: "/repo's checkout",
		NS_CLI_REL_PATH: "ts/bin/ns.ts",
		NS_INSTALL_HINT: "install ns",
	};
}

describe("typed public-package workflows", () => {
	it("bumps only changed manifests and refreshes the lockfile without a legacy script", async () => {
		const files = packageSetFiles("1.0.0");
		const unchangedPath = resolve(fixtureRoot(0), "package.json");
		files[unchangedPath] = JSON.stringify({ name: releaseInventoryFixture[0], version: "1.2.3" });
		const run = runScenario(["bump-public-package-version", "1.2.3", "--format", "json"], {
			files,
		});

		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([
			{
				command: "corepack",
				args: [
					"pnpm@11.8.0",
					"--config.verify-deps-before-run=false",
					"--dir",
					workspaceRoot,
					"install",
					"--lockfile-only",
				],
				cwd: resolve(workspaceRoot, ".."),
			},
		]);
		expect(run.calls.flatMap((call) => call.args).join(" ")).not.toContain("ts/scripts");
		expect(run.fs.writtenFiles.map((entry) => entry.path)).not.toContain(unchangedPath);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { version: "1.2.3", changedPackages: releaseInventoryFixture.slice(1) },
		});
	});

	it("rejects an invalid bump version before filesystem writes or commands", async () => {
		const run = runScenario(["bump-public-package-version", "latest", "--format", "json"], {
			files: packageSetFiles("1.0.0"),
		});

		expect(await run.exit).toBe(2);
		expect(run.calls).toEqual([]);
		expect(run.fs.writtenFiles).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "version-bump-failed",
		});
	});

	it("reports structured lockfile failure after manifest updates", async () => {
		const run = runScenario(["bump-public-package-version", "1.2.3", "--format", "json"], {
			files: packageSetFiles("1.0.0"),
			commandResults: [exitedResult({ code: 9, stderr: "lockfile failed" })],
		});

		expect(await run.exit).toBe(2);
		expect(run.calls).toHaveLength(1);
		expect(run.fs.writtenFiles).toHaveLength(releaseInventoryFixture.length);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "subprocess-failed",
			data: { termination: "exited", exitCode: 9, stderr: "lockfile failed" },
		});
	});

	it("prepares the default cwd with rewritten source, README, extras, and manifest fields", async () => {
		const files = packageSetFiles("1.0.0");
		const packageRoot = fixtureRoot(0);
		const publishRoot = resolve(packageRoot, "dist", "publish");
		const extraRoot = resolve(repoRoot, "skills", "fixture-skill");
		files[resolve(workspaceRoot, "pnpm-workspace.yaml")] =
			"catalog:\n  zod: 4.3.6\n  '@types/node': 24.0.0\n";
		files[resolve(packageRoot, "package.json")] = JSON.stringify({
			name: releaseInventoryFixture[0],
			version: "1.0.0",
			type: "module",
			files: ["src"],
			bin: { branch: "./src/cli.ts" },
			dependencies: {
				"@nseng-ai/sdk": "workspace:*",
				"@nseng-ai/foundation": "workspace:^",
				zod: "catalog:",
			},
			ns: {
				publishExtras: [
					{
						kind: "skill",
						name: "fixture-skill",
						sourcePath: "skills/fixture-skill",
						publishPath: "skills/fixture-skill",
					},
				],
			},
		});
		files[resolve(packageRoot, "src", "index.ts")] =
			'import sdk from "@nseng-ai/sdk";\nexport * from "@nseng-ai/sdk/objectives";\n';
		files[resolve(packageRoot, "README.md")] = "# Fixture\n";
		files[resolve(extraRoot, "SKILL.md")] = "---\nname: fixture-skill\n---\n";
		const run = runScenario(["prepare-source-publish-package", "--format", "json"], {
			cwd: packageRoot,
			files,
		});

		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { packageName: releaseInventoryFixture[0], publishRoot },
		});
		expect(run.fs.copiedFiles).toEqual(
			expect.arrayContaining([
				{
					source: resolve(packageRoot, "src", "index.ts"),
					destination: resolve(publishRoot, "src", "index.ts"),
				},
				{
					source: resolve(packageRoot, "README.md"),
					destination: resolve(publishRoot, "README.md"),
				},
				{
					source: resolve(extraRoot, "SKILL.md"),
					destination: resolve(publishRoot, "skills", "fixture-skill", "SKILL.md"),
				},
			]),
		);
		const rewrittenSource = run.fs.writtenFiles.find(
			(entry) => entry.path === resolve(publishRoot, "src", "index.ts"),
		);
		expect(rewrittenSource?.content).toContain('"@nseng-ai/ns/sdk"');
		expect(rewrittenSource?.content).toContain('"@nseng-ai/ns/sdk/objectives"');
		const manifestWrite = run.fs.writtenFiles.find(
			(entry) => entry.path === resolve(publishRoot, "package.json"),
		);
		const manifest = JSON.parse(manifestWrite?.content ?? "{}");
		expect(manifest).toMatchObject({
			files: ["src", "skills"],
			bin: { branch: "src/cli.ts" },
			dependencies: {
				"@nseng-ai/ns": "1.0.0",
				"@nseng-ai/foundation": "1.0.0",
				zod: "4.3.6",
			},
			ns: {
				publishExtras: [{ name: "fixture-skill", publishPath: "skills/fixture-skill" }],
			},
		});
		expect(JSON.stringify(manifest)).not.toMatch(/workspace:|catalog:/u);
	});

	it("honors an explicit package root when the CLI cwd is the workspace root", async () => {
		const files = packageSetFiles("1.0.0");
		const packageRoot = fixtureRoot(0);
		files[resolve(packageRoot, "package.json")] = JSON.stringify({
			name: releaseInventoryFixture[0],
			version: "1.0.0",
			type: "module",
			files: ["src"],
		});
		files[resolve(packageRoot, "src", "index.ts")] = "export {};\n";
		const run = runScenario(["prepare-source-publish-package", packageRoot, "--format", "json"], {
			cwd: workspaceRoot,
			files,
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { publishRoot: resolve(packageRoot, "dist", "publish") },
		});
	});

	it("rejects an unpublishable source package before mutating its publish root", async () => {
		const packageRoot = "/package";
		const run = runScenario(["prepare-source-publish-package", "--format", "json"], {
			cwd: packageRoot,
			files: {
				[resolve(packageRoot, "package.json")]: JSON.stringify({
					name: "@nseng-ai/private-fixture",
					private: true,
					type: "module",
					files: ["src"],
				}),
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.calls).toEqual([]);
		expect(run.fs.removedPaths).toEqual([]);
		expect(run.fs.copiedFiles).toEqual([]);
		expect(run.fs.writtenFiles).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "package-preparation-failed",
		});
	});

	it("converts legacy verification seconds while retaining repeated millisecond delays", () => {
		expect(
			resolveVerifyDelaysMs({
				verifyDelayMs: ["25", "50"],
				verifyDelaySeconds: ["1", "3"],
			}),
		).toEqual([25, 50, 1_000, 3_000]);
	});

	describe("qualify-public-package-set", () => {
		it("qualifies every derived candidate and only them, in check, test, then publish order", async () => {
			const run = runScenario(["qualify-public-package-set", "--format", "json"], {
				files: packageSetFiles(version),
			});

			expect(await run.exit).toBe(0);
			expect(
				run.calls
					.filter((call) => call.command === "pnpm" && call.args.at(-1) === "check")
					.map((call) => call.args[3]),
			).toEqual(releaseInventoryFixture);
			expect(run.calls.map((call) => call.args[3])).not.toContain("@nseng-ai/flow");
			expect(run.calls.map((call) => [call.command, call.args.at(-1)]).slice(0, 3)).toEqual([
				["pnpm", "check"],
				["pnpm", "test"],
				["npm", expect.stringContaining("dist/publish")],
			]);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "ok",
				data: {
					packages: releaseInventoryFixture,
					publishRoots: releaseInventoryFixture
						.filter((name) => name !== "@nseng-ai/ns")
						.map((name) =>
							expect.stringContaining(
								`fixture-${releaseInventoryFixture.indexOf(name)}/dist/publish`,
							),
						),
				},
			});
		});

		it("applies both skip flags without hidden checks or dry runs", async () => {
			const run = runScenario(
				["qualify-public-package-set", "--skip-checks", "--skip-dry-run", "--format", "json"],
				{ files: packageSetFiles(version) },
			);

			expect(await run.exit).toBe(0);
			expect(run.calls).toEqual([
				{
					command: "pnpm",
					args: ["--dir", "ts", "--filter", "@nseng-ai/ns", "run", "pack:local"],
					cwd: repoRoot,
				},
			]);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "ok",
				data: { packages: releaseInventoryFixture },
			});
		});

		it("rejects version mismatch before commands and stops at the first command failure", async () => {
			const mismatch = runScenario(
				["qualify-public-package-set", "--version=9.9.9", "--format", "json"],
				{ files: packageSetFiles(version) },
			);
			expect(await mismatch.exit).toBe(2);
			expect(mismatch.calls).toEqual([]);
			expect(parseJsonOutput(mismatch)).toMatchObject({
				status: "failure",
				errorType: "package-qualification-failed",
			});

			const failed = runScenario(["qualify-public-package-set", "--format", "json"], {
				files: packageSetFiles(version),
				commandResults: [exitedResult({ code: 7, stderr: "check failed" })],
			});
			expect(await failed.exit).toBe(2);
			expect(failed.calls).toHaveLength(1);
			expect(parseJsonOutput(failed)).toMatchObject({
				status: "failure",
				errorType: "subprocess-failed",
				data: { termination: "exited", exitCode: 7, stderr: "check failed" },
			});
		});
	});

	describe("verify-public-package-set", () => {
		it("reads every intended package in order and reports all published", async () => {
			const run = runScenario(
				["verify-public-package-set", `--version=${version}`, "--strict", "--format", "json"],
				{ files: packageSetFiles(version), commandResults: registryResults() },
			);

			expect(await run.exit).toBe(0);
			expect(run.calls.map((call) => call.args[1])).toEqual(
				releaseInventoryFixture.map((name) => `${name}@${version}`),
			);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "ok",
				data: {
					strict: true,
					results: releaseInventoryFixture.map((packageName) => ({
						packageName,
						status: "published",
					})),
				},
			});
		});

		it("allows missing and mismatched metadata non-strictly but rejects the same evidence strictly", async () => {
			const evidence = () => [
				missingResult(),
				registryResult(releaseInventoryFixture[1] ?? "", "0.0.1"),
				...releaseInventoryFixture.slice(2).map((name) => registryResult(name)),
			];
			const nonStrict = runScenario(["verify-public-package-set", "--format", "json"], {
				files: packageSetFiles(version),
				commandResults: evidence(),
			});
			expect(await nonStrict.exit).toBe(0);
			const nonStrictOutput = parseJsonOutput(nonStrict) as {
				data: { results: { status: string }[] };
				status: string;
			};
			expect(nonStrictOutput.status).toBe("ok");
			expect(nonStrictOutput.data.results.slice(0, 2)).toMatchObject([
				{ status: "missing" },
				{ status: "mismatched" },
			]);

			const strict = runScenario(["verify-public-package-set", "--strict", "--format", "json"], {
				files: packageSetFiles(version),
				commandResults: evidence(),
			});
			expect(await strict.exit).toBe(2);
			const strictOutput = parseJsonOutput(strict) as {
				data: { results: { status: string }[]; strict: boolean };
				errorType: string;
				status: string;
			};
			expect(strictOutput).toMatchObject({
				status: "failure",
				errorType: "registry-verification-failed",
				data: { strict: true },
			});
			expect(strictOutput.data.results.slice(0, 2)).toMatchObject([
				{ status: "missing" },
				{ status: "mismatched" },
			]);
		});

		it.each([
			[
				"spawn-failed",
				{ type: "spawn-failed", stdout: "", stderr: "npm error code E404", error: "spawn ENOENT" },
			],
			["cancelled", terminatedResult("cancelled")],
			["timed-out", terminatedResult("timed-out")],
		] as const)("classifies E404 text from %s as an operational error", async (_label, result) => {
			const run = runScenario(["verify-public-package-set", "--format", "json"], {
				files: packageSetFiles(version),
				commandResults: [result, ...registryResults().slice(1)],
			});

			expect(await run.exit).toBe(2);
			const output = parseJsonOutput(run) as {
				data: { results: { status: string }[] };
				errorType: string;
				status: string;
			};
			expect(output).toMatchObject({
				status: "failure",
				errorType: "registry-verification-failed",
			});
			expect(output.data.results[0]).toMatchObject({ status: "error" });
		});

		it("validates candidate hash evidence and candidate-report identity before registry calls", async () => {
			const reportPath = "/candidate.json";
			const valid = runScenario(
				[
					"verify-public-package-set",
					"--candidate-report",
					reportPath,
					"--strict",
					"--format",
					"json",
				],
				{
					files: { ...packageSetFiles(version), [reportPath]: JSON.stringify(candidateReport()) },
					commandResults: registryResults(),
				},
			);
			expect(await valid.exit).toBe(0);
			const validOutput = parseJsonOutput(valid) as {
				data: { results: { evidence: string[] }[] };
				status: string;
			};
			expect(validOutput.status).toBe("ok");
			expect(validOutput.data.results[0]?.evidence).toEqual([
				"dist.integrity exact",
				"dist.shasum exact",
			]);

			for (const [name, report, args] of [
				["malformed", { schemaVersion: 1 }, []],
				["version mismatch", candidateReport("2.0.0"), [`--version=${version}`]],
			] as const) {
				const rejected = runScenario(
					[
						"verify-public-package-set",
						"--candidate-report",
						reportPath,
						...args,
						"--format",
						"json",
					],
					{ files: { ...packageSetFiles(version), [reportPath]: JSON.stringify(report) } },
				);
				expect(await rejected.exit, name).toBe(2);
				expect(rejected.calls, name).toEqual([]);
				expect(parseJsonOutput(rejected)).toMatchObject({
					status: "failure",
					errorType: "registry-verification-failed",
				});
			}
		});
	});

	describe("publish-public-package-set", () => {
		it("dry-runs qualification in publish order without registry writes or confirmation", async () => {
			const confirmations: string[] = [];
			const run = runScenario(
				["publish-public-package-set", "dry-run", version, "--format", "json"],
				{ files: packageSetFiles(version), release: confirmingReleaseContext(confirmations) },
			);

			expect(await run.exit).toBe(0);
			expect(run.calls).toHaveLength(qualificationCommandCount);
			expect(
				run.calls
					.filter((call) => call.command === "pnpm" && call.args.at(-1) === "check")
					.map((call) => call.args[3]),
			).toEqual(releaseInventoryFixture);
			expect(run.calls.some((call) => call.args[0] === "view")).toBe(false);
			expect(
				run.calls.some((call) => call.args[0] === "publish" && call.args[1] !== "--dry-run"),
			).toBe(false);
			expect(confirmations).toEqual([]);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "ok",
				data: { mode: "dry-run", version, packages: releaseInventoryFixture },
			});
		});

		it("short-circuits before confirmation and writes when the version is already published", async () => {
			const confirmations: string[] = [];
			const run = runScenario(
				["publish-public-package-set", "publish", version, "--format", "json"],
				{
					files: packageSetFiles(version),
					commandResults: successfulResults(
						1 + qualificationCommandCount + releaseInventoryFixture.length,
					),
					release: confirmingReleaseContext(confirmations),
				},
			);

			expect(await run.exit).toBe(2);
			expect(confirmations).toEqual([]);
			expect(run.calls.filter((call) => call.args[0] === "view")).toHaveLength(
				releaseInventoryFixture.length,
			);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "failure",
				errorType: "package-already-published",
			});
		});

		it("publishes fake package roots in order and stops on the first publish failure", async () => {
			const prefix = [
				...successfulResults(1 + qualificationCommandCount),
				...releaseInventoryFixture.map(() => missingResult()),
			];
			const success = runScenario(
				["publish-public-package-set", "publish", version, "--format", "json"],
				{
					files: packageSetFiles(version),
					commandResults: [
						...prefix,
						...successfulResults(releaseInventoryFixture.length),
						...registryResults(),
					],
					release: confirmingReleaseContext([]),
				},
			);
			expect(await success.exit).toBe(0);
			expect(
				success.calls
					.filter(
						(call) =>
							call.command === "npm" && call.args[0] === "publish" && call.args[1] !== "--dry-run",
					)
					.map((call) => call.args[1]),
			).toEqual(
				releaseInventoryFixture.map((name) =>
					expect.stringContaining(`fixture-${releaseInventoryFixture.indexOf(name)}/dist/publish`),
				),
			);

			const failed = runScenario(
				["publish-public-package-set", "publish", version, "--format", "json"],
				{
					files: packageSetFiles(version),
					commandResults: [...prefix, exitedResult({ code: 17, stderr: "publish refused" })],
					release: confirmingReleaseContext([]),
				},
			);
			expect(await failed.exit).toBe(2);
			expect(
				failed.calls.filter(
					(call) =>
						call.command === "npm" && call.args[0] === "publish" && call.args[1] !== "--dry-run",
				),
			).toHaveLength(1);
			expect(parseJsonOutput(failed)).toMatchObject({
				status: "failure",
				exitCode: 2,
				errorType: "subprocess-failed",
				data: { termination: "exited", exitCode: 17, stderr: "publish refused" },
			});
		});

		it("uses the injected scheduler for repeated millisecond and legacy-second delays", async () => {
			const timers = new RecordingTimerScheduler();
			const run = runScenario(
				[
					"publish-public-package-set",
					"publish",
					version,
					"--verify-delay-ms",
					"5",
					"--verify-delay-ms",
					"7",
					"--verify-delay-seconds",
					"1",
					"--format",
					"json",
				],
				{
					files: packageSetFiles(version),
					commandResults: [
						...successfulResults(1 + qualificationCommandCount),
						...releaseInventoryFixture.map(() => missingResult()),
						...successfulResults(releaseInventoryFixture.length),
						...releaseInventoryFixture.map(() => missingResult()),
						...releaseInventoryFixture.map(() => missingResult()),
						...releaseInventoryFixture.map(() => missingResult()),
						...registryResults(),
					],
					timers,
					release: confirmingReleaseContext([]),
				},
			);

			expect(await run.exit).toBe(0);
			expect(timers.delaysMs).toEqual([5, 7, 1_000]);
		});

		it.each([
			[
				"spawn-failed",
				{ type: "spawn-failed", stdout: "", stderr: "npm error code E404", error: "spawn ENOENT" },
			],
			["cancelled", terminatedResult("cancelled")],
			["timed-out", terminatedResult("timed-out")],
		] as const)(
			"treats precheck E404 text from %s as operational failure",
			async (_label, result) => {
				const run = runScenario(
					["publish-public-package-set", "publish", version, "--format", "json"],
					{
						files: packageSetFiles(version),
						commandResults: [
							...successfulResults(1 + qualificationCommandCount),
							result,
							...releaseInventoryFixture.slice(1).map(() => missingResult()),
						],
						release: confirmingReleaseContext([]),
					},
				);

				expect(await run.exit).toBe(2);
				expect(parseJsonOutput(run)).toMatchObject({
					status: "failure",
					errorType: "registry-precheck-failed",
				});
			},
		);

		it.each([
			[["publish-public-package-set", "preview", version], "mode"],
			[["publish-public-package-set", "publish", "latest"], "version"],
			[["publish-public-package-set", "publish", version, "--verify-delay-ms", "soon"], "delay"],
		] as const)("rejects invalid %s input before external calls", async (args, _label) => {
			const run = runScenario([...args, "--format", "json"], { files: packageSetFiles(version) });
			expect(await run.exit).toBe(2);
			expect(run.calls).toEqual([]);
		});
	});

	it("creates and cleans an SDK consumer fixture through injected seams", async () => {
		const run = runScenario(["smoke-sdk-consumer-resolution", "/publish/sdk", "--format", "json"], {
			files: {
				[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.calls.map((call) => call.command)).toEqual([
			"npm",
			resolve(workspaceRoot, "node_modules", ".bin", "tsc"),
		]);
		expect(run.calls.flatMap((call) => call.args).join(" ")).not.toContain("ts/scripts");
		expect(run.fs.removedPaths).toEqual([expect.stringContaining("ns-sdk-consumer-fake")]);
	});

	it("keeps the SDK consumer fixture when requested", async () => {
		const run = runScenario(["smoke-sdk-consumer-resolution", "/publish/sdk", "--format", "json"], {
			env: { NS_SDK_KEEP_SMOKE_DIR: "1" },
			files: {
				[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.fs.removedPaths).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({ status: "ok", data: { kept: true } });
	});

	it("short-circuits compile and cleans up after structured install failure", async () => {
		const run = runScenario(["smoke-sdk-consumer-resolution", "/publish/sdk", "--format", "json"], {
			files: {
				[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
			},
			commandResults: [
				{ type: "spawn-failed", stdout: "", stderr: "spawn npm ENOENT", error: "spawn npm ENOENT" },
			],
		});

		expect(await run.exit).toBe(2);
		expect(run.calls.map((call) => call.command)).toEqual(["npm"]);
		expect(run.fs.removedPaths).toEqual([expect.stringContaining("ns-sdk-consumer-fake")]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "subprocess-failed",
			data: { termination: "spawn-failed", exitCode: null, error: "spawn npm ENOENT" },
		});
	});

	it("cleans up after compile failure without running later commands", async () => {
		const run = runScenario(["smoke-sdk-consumer-resolution", "/publish/sdk", "--format", "json"], {
			files: {
				[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
			},
			commandResults: [exitedResult(), exitedResult({ code: 1, stderr: "type error" })],
		});

		expect(await run.exit).toBe(2);
		expect(run.calls).toHaveLength(2);
		expect(run.fs.removedPaths).toEqual([expect.stringContaining("ns-sdk-consumer-fake")]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			data: { termination: "exited", exitCode: 1, stderr: "type error" },
		});
	});

	it("renders a CLI shim with shell escaping through injected seams", async () => {
		const run = runScenario(["render-cli-shim", "--format", "json"], {
			env: shimEnv(),
			files: {
				"/template":
					"@@NS_TOOL@@ @@NS_CANONICAL_CHECKOUT@@ @@NS_CLI_REL_PATH@@ @@NS_INSTALL_HINT@@ @@NS_FALLBACK_MODE@@\n",
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([]);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/output",
			content: "'ns tool' '/repo'\\''s checkout' ts/bin/ns.ts 'install ns' literal\n",
		});
	});

	it("reports all missing shim environment variables before reading or writing", async () => {
		const run = runScenario(["render-cli-shim", "--format", "json"], { env: {} });

		expect(await run.exit).toBe(2);
		expect(run.fs.writtenFiles).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: {
				missing: [
					"NS_TEMPLATE",
					"NS_OUTPUT",
					"NS_TOOL",
					"NS_CANONICAL_CHECKOUT",
					"NS_CLI_REL_PATH",
					"NS_INSTALL_HINT",
				],
			},
		});
	});

	it("refuses an unrendered shim token without writing output", async () => {
		const run = runScenario(["render-cli-shim", "--format", "json"], {
			env: shimEnv(),
			files: { "/template": "@@NS_UNKNOWN@@\n" },
		});

		expect(await run.exit).toBe(2);
		expect(run.fs.writtenFiles).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "shim-render-failed",
		});
	});

	it.each([
		["read", { readFailures: { "/template": "template read denied" } }],
		[
			"write",
			{
				files: { "/template": "@@NS_TOOL@@\n" },
				writeFailures: { "/output": "output write denied" },
			},
		],
	] as const)(
		"returns a structured shim %s failure without an output write",
		async (_kind, failure) => {
			const run = runScenario(["render-cli-shim", "--format", "json"], {
				env: shimEnv(),
				...failure,
			});

			expect(await run.exit).toBe(2);
			expect(run.fs.writtenFiles).toEqual([]);
			expect(parseJsonOutput(run)).toMatchObject({
				status: "failure",
				errorType: "shim-render-failed",
			});
		},
	);
});
