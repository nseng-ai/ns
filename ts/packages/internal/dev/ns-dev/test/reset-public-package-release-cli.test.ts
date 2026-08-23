import type { ClinkrInteraction } from "@nseng-ai/clinkr";
import { machineEnvelopeSchema, createFakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
import { describe, expect, it } from "vitest";

import { releaseInventoryFixture } from "./release-transaction-builders.ts";

import type {
	OperationResult,
	ReleaseResetGateway,
	ReleaseResetInspection,
	ReleaseResetManifestState,
	ReleaseTransactionReport,
	ValueResult,
} from "../src/release/contracts.ts";
import { releaseResetResultSchema } from "../src/release/reset.ts";
import { runScenario, type ScenarioRun } from "./scenario/run-scenario.ts";

const version = "1.2.3";
const sourceBranch = "feature/release-reset";
const headCommit = "abc123";
const releaseBranch = "transactional-npm-release/v1.2.3";
const releaseDirectory = "/repo/ts/dist/releases/1.2.3";
const releaseDirectoryFingerprint = "complete-release-directory-fingerprint";

interface FakeReleaseResetOptions {
	readonly inspection?: ReleaseResetInspection;
	readonly inspectFailure?: boolean;
	readonly restoreFailure?: boolean;
}

class FakeReleaseResetGateway implements ReleaseResetGateway {
	#inspection: ReleaseResetInspection;
	readonly #inspectFailure: boolean;
	#restoreFailure: boolean;
	readonly operations: string[] = [];

	constructor(options: FakeReleaseResetOptions = {}) {
		this.#inspection = copyInspection(options.inspection ?? resetInspection());
		this.#inspectFailure = options.inspectFailure ?? false;
		this.#restoreFailure = options.restoreFailure ?? false;
	}

	async inspectResetState(options: {
		readonly version: string;
		readonly releaseBranch: string;
	}): Promise<ValueResult<ReleaseResetInspection>> {
		this.operations.push(`inspect:${options.version}:${options.releaseBranch}`);
		if (this.#inspectFailure) {
			return {
				ok: false,
				error: { code: "fake-inspection-failed", message: "could not inspect reset state" },
			};
		}
		return { ok: true, value: copyInspection(this.#inspection) };
	}

	async restoreTrackedReleasePaths(paths: readonly string[]): Promise<OperationResult> {
		this.operations.push(`restore:${paths.join("|")}`);
		if (this.#restoreFailure) {
			this.#restoreFailure = false;
			return {
				ok: false,
				error: { code: "fake-restore-failed", message: "could not restore release paths" },
			};
		}
		const restored = new Set(paths);
		this.#inspection = {
			...this.#inspection,
			trackedChanges: this.#inspection.trackedChanges.filter(
				(change) => !restored.has(change.path),
			),
			manifests: this.#inspection.manifests.map((manifest) =>
				restored.has(manifest.path)
					? {
							...manifest,
							workingVersion: manifest.headVersion,
							changedFields: [],
							isExactVersionOnlyChange: false,
						}
					: { ...manifest, changedFields: [...manifest.changedFields] },
			),
		};
		return { ok: true, value: undefined };
	}

	async removeReleaseDirectory(options: {
		readonly version: string;
		readonly plannedPath: string;
	}): Promise<OperationResult> {
		const path = options.plannedPath;
		this.operations.push(`remove:${options.version}:${path}`);
		if (this.#inspection.releaseDirectory === path) {
			this.#inspection = {
				...this.#inspection,
				releaseDirectory: null,
				releaseDirectoryFingerprint: null,
				report: { type: "missing" },
			};
		}
		return { ok: true, value: undefined };
	}
}

function manifestPath(index: number): string {
	return `ts/packages/public-${index}/package.json`;
}

function resetManifests(changedIndexes: readonly number[]): readonly ReleaseResetManifestState[] {
	const changed = new Set(changedIndexes);
	return releaseInventoryFixture.map((packageName, index) => ({
		packageName,
		path: manifestPath(index),
		headVersion: "1.2.2",
		workingVersion: changed.has(index) ? version : "1.2.2",
		changedFields: changed.has(index) ? ["version"] : [],
		isExactVersionOnlyChange: changed.has(index),
	}));
}

function canonicalCandidates(): ReleaseTransactionReport["candidates"] {
	return releaseInventoryFixture.map((name, order) => ({
		name,
		version,
		tarballPath: `${releaseDirectory}/candidate-${order}.tgz`,
		integrity: `sha512-candidate-${order}`,
		shasum: `candidate-shasum-${order}`,
		order,
	}));
}

function releaseReport(commit: string = headCommit): ReleaseTransactionReport {
	return {
		schemaVersion: 1,
		release: { branch: sourceBranch, commit, version },
		inventory: [...releaseInventoryFixture],
		candidates: canonicalCandidates(),
		completedWrites: [],
		pendingWrite: null,
		stage: "candidates-prepared",
	};
}

function resetInspection(
	options: {
		readonly changedIndexes?: readonly number[];
		readonly releaseDirectory?: string | null;
		readonly releaseBranchExists?: boolean;
		readonly staleReport?: boolean;
	} = {},
): ReleaseResetInspection {
	const changedIndexes = options.changedIndexes ?? [0];
	return {
		currentSourceBranch: sourceBranch,
		headCommit,
		releaseBranch,
		releaseBranchExists: options.releaseBranchExists ?? false,
		inventory: releaseInventoryFixture,
		manifests: resetManifests(changedIndexes),
		trackedChanges: changedIndexes.map((index) => ({
			path: manifestPath(index),
			indexChanged: false,
			worktreeChanged: true,
		})),
		untrackedPaths: [],
		releaseDirectory:
			options.releaseDirectory === undefined ? releaseDirectory : options.releaseDirectory,
		releaseDirectoryFingerprint:
			options.releaseDirectory === null ? null : releaseDirectoryFingerprint,
		report:
			options.releaseDirectory === null
				? { type: "missing" }
				: {
						type: "found",
						report: releaseReport(options.staleReport === true ? "stale-commit" : headCommit),
						isCommitAncestorOfHead: true,
					},
	};
}

function copyInspection(value: ReleaseResetInspection): ReleaseResetInspection {
	return {
		...value,
		manifests: value.manifests.map((manifest) => ({
			...manifest,
			changedFields: [...manifest.changedFields],
		})),
		trackedChanges: value.trackedChanges.map((change) => ({ ...change })),
		untrackedPaths: [...value.untrackedPaths],
		report:
			value.report.type === "found"
				? {
						type: "found",
						report: structuredClone(value.report.report),
						isCommitAncestorOfHead: value.report.isCommitAncestorOfHead,
					}
				: value.report.type === "error"
					? { ...value.report, error: { ...value.report.error } }
					: { type: "missing" },
	};
}

async function parsedEnvelope(run: ScenarioRun) {
	const exitCode = await run.exit;
	const envelope = machineEnvelopeSchema.parse(JSON.parse(run.stdout.join("")));
	return { exitCode, envelope };
}

function expectBoundedResult(value: unknown, outcome: string): void {
	expect(releaseResetResultSchema.parse(value)).toMatchObject({ outcome });
}

describe("reset-public-package-release CLI", () => {
	it("dry-runs as a bounded success without prompting or mutation", async () => {
		const gateway = new FakeReleaseResetGateway();
		const interaction = createFakeClinkrInteraction({ isInteractive: true });
		const run = runScenario(["reset-public-package-release", version, "-n", "--format", "json"], {
			releaseReset: gateway,
			interaction: interaction.interaction,
		});

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(0);
		expect(envelope).toMatchObject({ status: "ok", exitCode: 0 });
		if (envelope.status === "ok") expectBoundedResult(envelope.data!, "reset-planned");
		expect(gateway.operations).toEqual([`inspect:${version}:${releaseBranch}`]);
		expect(interaction.requests()).toEqual([]);
		interaction.assertComplete();
	});

	it("applies with --yes after exact domain revalidation and without prompting", async () => {
		const gateway = new FakeReleaseResetGateway();
		const interaction = createFakeClinkrInteraction({ isInteractive: false });
		const run = runScenario(
			["reset-public-package-release", version, "--yes", "--format", "json"],
			{ releaseReset: gateway, interaction: interaction.interaction },
		);

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(0);
		if (envelope.status === "ok") expectBoundedResult(envelope.data!, "reset");
		expect(gateway.operations).toEqual([
			`inspect:${version}:${releaseBranch}`,
			`inspect:${version}:${releaseBranch}`,
			`restore:${manifestPath(0)}`,
			`remove:${version}:${releaseDirectory}`,
			`inspect:${version}:${releaseBranch}`,
		]);
		expect(interaction.requests()).toEqual([]);
	});

	it("renders the complete impact to stderr before an interactive default-no prompt", async () => {
		const gateway = new FakeReleaseResetGateway({
			inspection: resetInspection({ staleReport: true }),
		});
		const fake = createFakeClinkrInteraction({
			confirmations: [{ type: "confirmed" }],
			isInteractive: true,
		});
		let run: ScenarioRun | undefined;
		const interaction: ClinkrInteraction = {
			isInteractive: () => true,
			confirm: async (request) => {
				const stderr = run?.stderr.join("") ?? "";
				expect(stderr).toContain(`Version: ${version}`);
				expect(stderr).toContain(`Source branch: ${sourceBranch}`);
				expect(stderr).toContain(`HEAD: ${headCommit}`);
				expect(stderr).toContain("stale=yes");
				expect(stderr).toContain(`Exact release directory: ${releaseDirectory}`);
				expect(stderr).toContain(`Release directory fingerprint: ${releaseDirectoryFingerprint}`);
				expect(stderr).toContain("ancestor-of-HEAD=yes");
				expect(stderr).toContain(manifestPath(0));
				return await fake.interaction.confirm(request);
			},
		};
		run = runScenario(["reset-public-package-release", version, "--format", "json"], {
			releaseReset: gateway,
			interaction,
		});

		const { exitCode } = await parsedEnvelope(run);
		expect(exitCode).toBe(0);
		expect(fake.requests()).toEqual([
			{
				message: `Apply this exact public-package release reset for ${version}?`,
				defaultAnswer: "no",
			},
		]);
		fake.assertComplete();
	});

	it("threads injected stdin through entrypoint construction into confirmation", async () => {
		const gateway = new FakeReleaseResetGateway();
		let reads = 0;
		const run = runScenario(["reset-public-package-release", version, "--format", "json"], {
			releaseReset: gateway,
			stdin: async () => {
				reads += 1;
				return "yes";
			},
		});

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(0);
		if (envelope.status === "ok") expectBoundedResult(envelope.data!, "reset");
		expect(reads).toBe(1);
		expect(run.stderr.join("")).toContain("[y/N]");
	});

	it.each([
		["declined", { type: "declined" } as const],
		["aborted", { type: "aborted" } as const],
	])("maps %s confirmation to an unchanged declined plan", async (_name, confirmation) => {
		const gateway = new FakeReleaseResetGateway();
		const interaction = createFakeClinkrInteraction({
			confirmations: [confirmation],
			isInteractive: true,
		});
		const run = runScenario(["reset-public-package-release", version, "--format", "json"], {
			releaseReset: gateway,
			interaction: interaction.interaction,
		});

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(1);
		expect(envelope).toMatchObject({ status: "negative", exitCode: 1 });
		if (envelope.status === "negative") {
			expectBoundedResult(envelope.data!, "declined");
			expect(envelope.data!).toMatchObject({
				trackedPathsToRestore: [manifestPath(0)],
				plannedActions: [
					{ type: "restore-tracked-paths", paths: [manifestPath(0)] },
					{ type: "remove-release-directory", path: releaseDirectory },
				],
				completedActions: [],
			});
		}
		expect(gateway.operations).toEqual([`inspect:${version}:${releaseBranch}`]);
		interaction.assertComplete();
	});

	it("rejects noninteractive apply without prompting and gives both authorization paths", async () => {
		const gateway = new FakeReleaseResetGateway();
		const interaction = createFakeClinkrInteraction({ isInteractive: false });
		const run = runScenario(["reset-public-package-release", version, "--format", "json"], {
			releaseReset: gateway,
			interaction: interaction.interaction,
		});

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(2);
		expect(envelope).toMatchObject({ status: "usageError", exitCode: 2 });
		if (envelope.status === "usageError") {
			expect(envelope.message).toContain("--yes");
			expect(envelope.message).toContain("--dry-run");
			expect(envelope.data!).toMatchObject({ missingFlag: "--yes" });
		}
		expect(gateway.operations).toEqual([`inspect:${version}:${releaseBranch}`]);
		expect(interaction.requests()).toEqual([]);
	});

	it("returns already-clean as an apply no-op without confirmation", async () => {
		const gateway = new FakeReleaseResetGateway({
			inspection: resetInspection({ changedIndexes: [], releaseDirectory: null }),
		});
		const interaction = createFakeClinkrInteraction({ isInteractive: false });
		const run = runScenario(["reset-public-package-release", version, "--format", "json"], {
			releaseReset: gateway,
			interaction: interaction.interaction,
		});

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(0);
		if (envelope.status === "ok") expectBoundedResult(envelope.data!, "already-clean");
		expect(gateway.operations).toHaveLength(1);
		expect(interaction.requests()).toEqual([]);
	});

	it("maps a hard safety refusal to a structured negative", async () => {
		const gateway = new FakeReleaseResetGateway({
			inspection: resetInspection({ releaseBranchExists: true }),
		});
		const run = runScenario(
			["reset-public-package-release", version, "--dry-run", "--format", "json"],
			{ releaseReset: gateway },
		);

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(1);
		expect(envelope).toMatchObject({ status: "negative", exitCode: 1 });
		if (envelope.status === "negative") {
			expectBoundedResult(envelope.data!, "refused");
			expect(envelope.data!).toMatchObject({
				code: "release-branch-exists",
				guidance: expect.stringContaining("never deletes branches"),
				evidence: { releaseBranch, releaseBranchExists: true },
			});
		}
		expect(gateway.operations.every((operation) => operation.startsWith("inspect:"))).toBe(true);
	});

	it("maps inspection adapter failure to the stable command-local failure", async () => {
		const gateway = new FakeReleaseResetGateway({ inspectFailure: true });
		const run = runScenario(
			["reset-public-package-release", version, "--dry-run", "--format", "json"],
			{ releaseReset: gateway },
		);

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(2);
		expect(envelope).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "release-reset-failed",
		});
		if (envelope.status === "failure") {
			expectBoundedResult(envelope.data!, "refused");
			expect(envelope.data!).toMatchObject({
				code: "reset-inspection-failed",
				failure: { code: "fake-inspection-failed" },
			});
		}
	});

	it("maps an apply effect failure to failure with residual evidence", async () => {
		const gateway = new FakeReleaseResetGateway({ restoreFailure: true });
		const run = runScenario(
			["reset-public-package-release", version, "--yes", "--format", "json"],
			{ releaseReset: gateway },
		);

		const { exitCode, envelope } = await parsedEnvelope(run);
		expect(exitCode).toBe(2);
		expect(envelope).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "release-reset-failed",
		});
		if (envelope.status === "failure") {
			expectBoundedResult(envelope.data!, "refused");
			expect(envelope.data!).toMatchObject({
				code: "tracked-restore-failed",
				failure: { code: "fake-restore-failed" },
				evidence: { completedActions: [] },
			});
		}
		expect(gateway.operations).not.toContain(`remove:${version}:${releaseDirectory}`);
	});
});
