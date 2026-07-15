import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { publicPublishOrder } from "../../../../scripts/public-package-set.mjs";
import type {
	FreshReleaseGateway,
	FreshReleaseState,
	NpmCandidateGateway,
	OperationResult,
	OptionalResult,
	QualifiedPublishRoot,
	ReleaseCheckpoint,
	ReleaseReportStore,
	ReleaseTransactionReport,
	ValueResult,
} from "../src/release/contracts.ts";
import { releaseBranchName, startFreshRelease } from "../src/release/fresh.ts";
import { recoverCheckpointingReport } from "../src/release/resume.ts";

const version = "1.2.3-beta.1+build.7";
const parentBranch = "transactional-npm-release-exact-resume";
const parentCommit = "parent-commit";
const releaseCommit = "release-commit";
const manifestPaths = publicPublishOrder.map(
	(_name, index) => `ts/packages/public-${index}/package.json`,
);
const expectedPaths = [...manifestPaths, "ts/pnpm-lock.yaml"].sort();

interface FakeReleaseOptions {
	readonly state?: Partial<FreshReleaseState>;
	readonly trackedChanges?: readonly string[];
	readonly createResult?: ValueResult<ReleaseCheckpoint>;
}

class InMemoryFreshRelease implements FreshReleaseGateway {
	readonly #state: FreshReleaseState;
	readonly #trackedChanges: readonly string[];
	readonly #createResult: ValueResult<ReleaseCheckpoint>;
	readonly #operations: string[];
	readonly checkpointRequests: Array<{ branch: string; message: string }> = [];

	constructor(operations: string[], options: FakeReleaseOptions = {}) {
		this.#operations = operations;
		this.#state = {
			currentBranch: parentBranch,
			headCommit: parentCommit,
			trunkBranch: "main",
			isGraphiteTracked: true,
			isWorktreeClean: true,
			releaseBranchExists: false,
			sourceManifestPaths: manifestPaths,
			...options.state,
		};
		this.#trackedChanges = [...(options.trackedChanges ?? expectedPaths)];
		this.#createResult = options.createResult ?? {
			ok: true,
			value: {
				branch: releaseBranchName(version),
				commit: releaseCommit,
				isWorktreeClean: true,
			},
		};
	}

	async inspectFreshState(branch: string): Promise<ValueResult<FreshReleaseState>> {
		this.#operations.push(`inspect:${branch}`);
		return {
			ok: true,
			value: { ...this.#state, sourceManifestPaths: [...this.#state.sourceManifestPaths] },
		};
	}

	async bumpCoordinatedVersion(requestedVersion: string): Promise<OperationResult> {
		this.#operations.push(`bump:${requestedVersion}`);
		return { ok: true };
	}

	async qualifyPublicPackages(
		requestedVersion: string,
	): Promise<ValueResult<readonly QualifiedPublishRoot[]>> {
		this.#operations.push(`qualify:${requestedVersion}`);
		return {
			ok: true,
			value: publicPublishOrder.map((name) => ({ name, path: `/qualified/${name}` })),
		};
	}

	async listTrackedChanges(): Promise<ValueResult<readonly string[]>> {
		this.#operations.push("changes");
		return { ok: true, value: [...this.#trackedChanges] };
	}

	async stageReleaseFiles(paths: readonly string[]): Promise<OperationResult> {
		this.#operations.push(`stage:${[...paths].join("|")}`);
		return { ok: true };
	}

	async createReleaseCheckpoint(options: {
		readonly branch: string;
		readonly message: string;
	}): Promise<ValueResult<ReleaseCheckpoint>> {
		this.checkpointRequests.push({ ...options });
		this.#operations.push("graphite-create");
		return this.#createResult;
	}

	async inspectCheckpoint(): Promise<ValueResult<ReleaseCheckpoint>> {
		this.#operations.push("inspect-checkpoint");
		return {
			ok: true,
			value: {
				branch: releaseBranchName(version),
				commit: releaseCommit,
				isWorktreeClean: true,
			},
		};
	}
}

class InMemoryCandidates implements NpmCandidateGateway {
	readonly #operations: string[];

	constructor(operations: string[]) {
		this.#operations = operations;
	}

	async pack(options: { readonly publishRoot: string; readonly packDestination: string }) {
		const name = options.publishRoot.replace("/qualified/", "");
		this.#operations.push(`pack:${name}`);
		return {
			ok: true as const,
			value: {
				name,
				version,
				tarballPath: resolve(options.packDestination, `${name.replaceAll("/", "-")}.tgz`),
				integrity: `sha512-${name}`,
				shasum: `sha1-${name}`,
			},
		};
	}
}

class InMemoryReports implements ReleaseReportStore {
	readonly #operations: string[];
	#report: ReleaseTransactionReport | undefined;
	readonly #failFinalCheckpointWrite: boolean;
	#didFailFinalCheckpointWrite = false;

	constructor(operations: string[], failFinalCheckpointWrite = false) {
		this.#operations = operations;
		this.#failFinalCheckpointWrite = failFinalCheckpointWrite;
	}

	async read(): Promise<OptionalResult<ReleaseTransactionReport>> {
		return this.#report === undefined
			? { type: "missing" }
			: { type: "found", value: this.#report };
	}

	async writeAtomic(_path: string, report: ReleaseTransactionReport): Promise<OperationResult> {
		if (
			this.#failFinalCheckpointWrite &&
			!this.#didFailFinalCheckpointWrite &&
			report.stage === "candidates-prepared" &&
			report.release.commit === releaseCommit
		) {
			this.#didFailFinalCheckpointWrite = true;
			return { ok: false, error: { code: "report-write-failed", message: "injected" } };
		}
		this.#report = copyReport(report);
		this.#operations.push(`report:${report.release.branch}:${report.candidates.length}`);
		return { ok: true };
	}
}

describe("fresh transactional release", () => {
	it("rejects a non-concrete npm semver before inspection or mutation", async () => {
		const operations: string[] = [];
		const result = await startFreshRelease(
			{
				release: new InMemoryFreshRelease(operations),
				npmCandidates: new InMemoryCandidates(operations),
				reports: new InMemoryReports(operations),
			},
			{ version: "1.2", reportPath: "/release/report.json" },
		);

		expect(result).toMatchObject({
			type: "refused",
			error: { code: "invalid-release-version" },
		});
		expect(operations).toEqual([]);
	});

	it.each([
		["dirty worktree", { isWorktreeClean: false }, "release-worktree-dirty"],
		["Graphite trunk", { currentBranch: "main" }, "release-on-trunk"],
		["Graphite-untracked branch", { isGraphiteTracked: false }, "release-branch-untracked"],
		["release branch collision", { releaseBranchExists: true }, "release-branch-collision"],
	] as const)("rejects %s before mutation", async (_label, state, code) => {
		const { result, operations } = await runFresh({ state });

		expect(result).toMatchObject({ type: "refused", error: { code } });
		expect(operations).toEqual([`inspect:${releaseBranchName(version)}`]);
	});

	it("defines a deterministic sanitized release branch", () => {
		expect(releaseBranchName(version)).toBe("transactional-npm-release/v1.2.3-beta.1-build.7");
		expect(releaseBranchName(version)).toBe(releaseBranchName(version));
	});

	it.each([
		["missing", expectedPaths.slice(1)],
		["unexpected", [...expectedPaths, "ts/package.json"]],
	] as const)(
		"hard-stops on %s tracked changes and preserves generated effects",
		async (_label, paths) => {
			const { result, operations } = await runFresh({ trackedChanges: paths });

			expect(result).toMatchObject({
				type: "refused",
				error: { code: "release-change-set-mismatch" },
			});
			expect(operations).toContain(`bump:${version}`);
			expect(operations).toContain(`qualify:${version}`);
			expect(operations).toContain("changes");
			expect(operations).not.toContain("graphite-create");
			expect(operations.some((operation) => operation.startsWith("stage:"))).toBe(false);
		},
	);

	it("bumps, qualifies exactly once, freezes canonical candidates, and checkpoints only expected files", async () => {
		const operations: string[] = [];
		const release = new InMemoryFreshRelease(operations);
		const reports = new InMemoryReports(operations);
		const result = await startFreshRelease(
			{ release, npmCandidates: new InMemoryCandidates(operations), reports },
			{
				version,
				reportPath: "/workspace/ts/dist/releases/report.json",
				releaseDirectory: "/workspace/ts/dist/releases/candidates",
			},
		);

		expect(result.type).toBe("checkpointed");
		expect(operations.filter((operation) => operation.startsWith("bump:"))).toHaveLength(1);
		expect(operations.filter((operation) => operation.startsWith("qualify:"))).toHaveLength(1);
		expect(operations.filter((operation) => operation.startsWith("pack:"))).toEqual(
			publicPublishOrder.map((name) => `pack:${name}`),
		);
		expect(operations.indexOf(`bump:${version}`)).toBeLessThan(
			operations.indexOf(`qualify:${version}`),
		);
		expect(operations.indexOf(`qualify:${version}`)).toBeLessThan(
			operations.indexOf(`pack:${publicPublishOrder[0]}`),
		);
		expect(operations).toContain(`stage:${expectedPaths.join("|")}`);
		expect(release.checkpointRequests).toEqual([
			{
				branch: releaseBranchName(version),
				message: `Release public packages at ${version}`,
			},
		]);
		expect(operations.at(-1)).toBe("inspect-checkpoint");
		if (result.type === "checkpointed") {
			expect(result.report.release).toEqual({
				branch: releaseBranchName(version),
				commit: releaseCommit,
				version,
			});
		}
	});

	it("recovers safely after Graphite succeeds but the final report write fails", async () => {
		const operations: string[] = [];
		const reports = new InMemoryReports(operations, true);
		const started = await startFreshRelease(
			{
				release: new InMemoryFreshRelease(operations),
				npmCandidates: new InMemoryCandidates(operations),
				reports,
			},
			{
				version,
				reportPath: "/release/report.json",
				releaseDirectory: "/release",
			},
		);
		expect(started).toMatchObject({
			type: "refused",
			error: { code: "report-write-failed" },
		});
		expect(await reports.read()).toMatchObject({
			type: "found",
			value: {
				stage: "checkpointing",
				release: { branch: releaseBranchName(version), commit: parentCommit, version },
			},
		});

		const recovered = await recoverCheckpointingReport(
			{
				reports,
				candidateFiles: {
					async classify() {
						return { type: "exact" as const };
					},
				},
			},
			{
				reportPath: "/release/report.json",
				currentBranch: releaseBranchName(version),
				headCommit: releaseCommit,
				headParentCommit: parentCommit,
				coordinatedVersion: version,
			},
		);
		expect(recovered).toMatchObject({
			type: "valid",
			report: { release: { commit: releaseCommit }, stage: "candidates-prepared" },
		});
	});

	it("preserves staged release effects when Graphite checkpoint creation fails", async () => {
		const { result, operations } = await runFresh({
			createResult: {
				ok: false,
				error: { code: "graphite-failed", message: "checkpoint failed" },
			},
		});

		expect(result).toMatchObject({ type: "refused", error: { code: "graphite-failed" } });
		expect(operations.some((operation) => operation.startsWith("stage:"))).toBe(true);
		expect(operations.at(-1)).toBe("graphite-create");
	});
});

async function runFresh(options: FakeReleaseOptions) {
	const operations: string[] = [];
	const release = new InMemoryFreshRelease(operations, options);
	const result = await startFreshRelease(
		{
			release,
			npmCandidates: new InMemoryCandidates(operations),
			reports: new InMemoryReports(operations),
		},
		{
			version,
			reportPath: "/workspace/ts/dist/releases/report.json",
			releaseDirectory: "/workspace/ts/dist/releases/candidates",
		},
	);
	return { result, operations };
}

function copyReport(report: ReleaseTransactionReport): ReleaseTransactionReport {
	return {
		...report,
		release: { ...report.release },
		inventory: [...report.inventory],
		candidates: report.candidates.map((candidate) => ({ ...candidate })),
		completedWrites: [...report.completedWrites],
		pendingWrite: report.pendingWrite,
	};
}
