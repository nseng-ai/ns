import { describe, expect, it } from "vitest";

import { intendedPublicPackages, publicPublishOrder } from "../src/public-packages/package-set.ts";
import type {
	OperationResult,
	ReleaseResetGateway,
	ReleaseResetInspection,
	ReleaseResetManifestState,
	ReleaseResetReportState,
	ReleaseTransactionReport,
	ValueResult,
} from "../src/release/contracts.ts";
import {
	applyReleaseReset,
	classifyReleaseReset,
	planReleaseReset,
	type ReleaseResetPlan,
} from "../src/release/reset.ts";

const version = "1.2.3-beta.1+build.7";
const sourceBranch = "release-reset-source";
const headCommit = "a".repeat(40);
const staleAncestorCommit = "b".repeat(40);
const releaseBranch = "transactional-npm-release/v1.2.3-beta.1-build.7";
const releaseDirectory = `/repo/ts/dist/releases/${version}`;
const releaseDirectoryFingerprint = "release-directory-fingerprint";
const lockfilePath = "ts/pnpm-lock.yaml";

interface FakeOptions {
	readonly inspection?: ReleaseResetInspection;
	readonly restoreFailures?: number;
	readonly removeFailures?: number;
}

class InMemoryReleaseResetGateway implements ReleaseResetGateway {
	#inspection: ReleaseResetInspection;
	#restoreFailures: number;
	#removeFailures: number;
	readonly operations: string[] = [];
	readonly restoreRequests: Array<readonly string[]> = [];
	readonly removeRequests: string[] = [];

	constructor(options: FakeOptions = {}) {
		this.#inspection = copyInspection(options.inspection ?? inspection());
		this.#restoreFailures = options.restoreFailures ?? 0;
		this.#removeFailures = options.removeFailures ?? 0;
	}

	replaceInspection(next: ReleaseResetInspection): void {
		this.#inspection = copyInspection(next);
	}

	async inspectResetState(options: {
		readonly version: string;
		readonly releaseBranch: string;
	}): Promise<ValueResult<ReleaseResetInspection>> {
		this.operations.push(`inspect:${options.version}:${options.releaseBranch}`);
		return { ok: true, value: copyInspection(this.#inspection) };
	}

	async restoreTrackedReleasePaths(paths: readonly string[]): Promise<OperationResult> {
		const request = [...paths];
		this.restoreRequests.push(request);
		this.operations.push(`restore:${request.join("|")}`);
		if (this.#restoreFailures > 0) {
			this.#restoreFailures -= 1;
			return {
				ok: false,
				error: { code: "fake-restore-failed", message: "restore failed" },
			};
		}
		const restored = new Set(request);
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
		this.removeRequests.push(path);
		this.operations.push(`remove:${options.version}:${path}`);
		if (this.#removeFailures > 0) {
			this.#removeFailures -= 1;
			return {
				ok: false,
				error: { code: "fake-remove-failed", message: "remove failed" },
			};
		}
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

function manifests(changedIndexes: readonly number[] = []): readonly ReleaseResetManifestState[] {
	const changed = new Set(changedIndexes);
	return intendedPublicPackages.map((packageName, index) => ({
		packageName,
		path: manifestPath(index),
		headVersion: "1.2.2",
		workingVersion: changed.has(index) ? version : "1.2.2",
		changedFields: changed.has(index) ? ["version"] : [],
		isExactVersionOnlyChange: changed.has(index),
	}));
}

function report(
	patch: Partial<ReleaseTransactionReport> = {},
	releasePatch: Partial<ReleaseTransactionReport["release"]> = {},
): ReleaseTransactionReport {
	return {
		schemaVersion: 1,
		release: {
			branch: sourceBranch,
			commit: headCommit,
			version,
			...releasePatch,
		},
		inventory: [...publicPublishOrder],
		candidates: [],
		completedWrites: [],
		pendingWrite: null,
		stage: "preparing-candidates",
		...patch,
	};
}

function canonicalCandidates(): ReleaseTransactionReport["candidates"] {
	return publicPublishOrder.map((name, order) => ({
		name,
		version,
		tarballPath: `${releaseDirectory}/candidate-${order}.tgz`,
		integrity: `sha512-candidate-${order}`,
		shasum: `candidate-shasum-${order}`,
		order,
	}));
}

function canonicalCandidate(order: number): ReleaseTransactionReport["candidates"][number] {
	const candidate = canonicalCandidates()[order];
	if (candidate === undefined) throw new Error(`Missing canonical candidate ${order}`);
	return candidate;
}

function foundReport(
	value: ReleaseTransactionReport,
	isCommitAncestorOfHead: boolean = true,
): ReleaseResetReportState {
	return { type: "found", report: value, isCommitAncestorOfHead };
}

function inspection(
	options: {
		readonly changedIndexes?: readonly number[];
		readonly trackedChanges?: ReleaseResetInspection["trackedChanges"];
		readonly untrackedPaths?: readonly string[];
		readonly report?: ReleaseResetReportState;
		readonly releaseDirectory?: string | null;
		readonly releaseBranchExists?: boolean;
		readonly manifests?: readonly ReleaseResetManifestState[];
	} = {},
): ReleaseResetInspection {
	const changedIndexes = options.changedIndexes ?? [0];
	return {
		currentSourceBranch: sourceBranch,
		headCommit,
		releaseBranch,
		releaseBranchExists: options.releaseBranchExists ?? false,
		manifests: (options.manifests ?? manifests(changedIndexes)).map((manifest) => ({
			...manifest,
			changedFields: [...manifest.changedFields],
		})),
		trackedChanges:
			options.trackedChanges ??
			changedIndexes.map((index) => ({
				path: manifestPath(index),
				indexChanged: false,
				worktreeChanged: true,
			})),
		untrackedPaths: [...(options.untrackedPaths ?? [])],
		releaseDirectory:
			options.releaseDirectory === undefined ? releaseDirectory : options.releaseDirectory,
		releaseDirectoryFingerprint:
			options.releaseDirectory === null ? null : releaseDirectoryFingerprint,
		report: options.report ?? foundReport(report()),
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

function requirePlan(result: Awaited<ReturnType<typeof planReleaseReset>>): ReleaseResetPlan {
	expect(result.outcome).toBe("reset-planned");
	if (result.outcome !== "reset-planned") throw new Error("Expected reset plan");
	return result;
}

function expectRefusal(result: ReturnType<typeof classifyReleaseReset>, code: string): void {
	expect(result).toMatchObject({ outcome: "refused", code });
}

describe("release reset planning", () => {
	it("accepts a report whose pre-checkpoint commit is stale and surfaces staleness", () => {
		const result = classifyReleaseReset(
			version,
			inspection({
				report: foundReport(
					report(
						{ stage: "candidates-prepared", candidates: canonicalCandidates() },
						{ commit: staleAncestorCommit },
					),
				),
			}),
		);

		expect(result).toMatchObject({
			outcome: "reset-planned",
			report: {
				type: "found",
				branch: sourceBranch,
				commit: staleAncestorCommit,
				isCommitStale: true,
				isCommitAncestorOfHead: true,
			},
		});
	});

	it("accepts a missing report after a partial version bump", () => {
		const result = classifyReleaseReset(
			version,
			inspection({ changedIndexes: [4], report: { type: "missing" }, releaseDirectory: null }),
		);

		expect(result).toMatchObject({
			outcome: "reset-planned",
			report: { type: "missing" },
			trackedPathsToRestore: [manifestPath(4)],
		});
	});

	it("allows any partial set of canonical manifests plus the lockfile", () => {
		const state = inspection({
			changedIndexes: [1, 7],
			trackedChanges: [
				{ path: manifestPath(7), indexChanged: false, worktreeChanged: true },
				{ path: lockfilePath, indexChanged: true, worktreeChanged: false },
				{ path: manifestPath(1), indexChanged: true, worktreeChanged: true },
			],
		});
		const result = classifyReleaseReset(version, state);

		expect(result).toMatchObject({
			outcome: "reset-planned",
			trackedPathsToRestore: [lockfilePath, manifestPath(1), manifestPath(7)].sort(),
		});
	});

	it("represents staged changes and plans one exact restore action", () => {
		const trackedChanges = [{ path: manifestPath(2), indexChanged: true, worktreeChanged: false }];
		const result = classifyReleaseReset(
			version,
			inspection({ changedIndexes: [2], trackedChanges, releaseDirectory: null }),
		);

		expect(result).toMatchObject({
			outcome: "reset-planned",
			trackedChanges,
			plannedActions: [{ type: "restore-tracked-paths", paths: [manifestPath(2)] }],
		});
	});

	it("plans artifact-only cleanup with a valid stale report", () => {
		const result = classifyReleaseReset(
			version,
			inspection({
				changedIndexes: [],
				report: foundReport(report({}, { commit: staleAncestorCommit })),
			}),
		);

		expect(result).toMatchObject({
			outcome: "reset-planned",
			trackedPathsToRestore: [],
			plannedActions: [{ type: "remove-release-directory", path: releaseDirectory }],
		});
	});

	it("returns an already-clean no-op", async () => {
		const gateway = new InMemoryReleaseResetGateway({
			inspection: inspection({ changedIndexes: [], releaseDirectory: null }),
		});

		const result = await planReleaseReset(gateway, version);

		expect(result).toMatchObject({
			outcome: "already-clean",
			trackedPathsToRestore: [],
			plannedActions: [],
			completedActions: [],
		});
		expect(gateway.operations).toHaveLength(1);
	});
});

describe("guarded release reset execution", () => {
	it("revalidates the exact authorized plan immediately before effects", async () => {
		const gateway = new InMemoryReleaseResetGateway();
		const plan = requirePlan(await planReleaseReset(gateway, version));

		const result = await applyReleaseReset(gateway, plan);

		expect(result.outcome).toBe("reset");
		expect(gateway.operations[0]).toMatch(/^inspect:/u);
		expect(gateway.operations[1]).toMatch(/^inspect:/u);
		expect(gateway.operations.at(-1)).toMatch(/^inspect:/u);
	});

	it("detects a complete release-directory fingerprint change before any effect", async () => {
		const gateway = new InMemoryReleaseResetGateway();
		const plan = requirePlan(await planReleaseReset(gateway, version));
		gateway.replaceInspection({
			...inspection(),
			releaseDirectoryFingerprint: "changed-release-directory-fingerprint",
		});

		const result = await applyReleaseReset(gateway, plan);

		expect(result).toMatchObject({
			outcome: "refused",
			code: "state-changed-after-authorization",
		});
		expect(gateway.restoreRequests).toEqual([]);
		expect(gateway.removeRequests).toEqual([]);
	});

	it("detects an authorized-state change even when published plan fields otherwise match", async () => {
		const gateway = new InMemoryReleaseResetGateway();
		const plan = requirePlan(await planReleaseReset(gateway, version));
		gateway.replaceInspection(
			inspection({
				report: foundReport(
					report({
						candidates: [
							{
								name: publicPublishOrder[0] ?? "@nseng-ai/clinkr",
								version,
								tarballPath: `${releaseDirectory}/clinkr.tgz`,
								integrity: "sha512-candidate",
								shasum: "candidate-shasum",
								order: 0,
							},
						],
					}),
				),
			}),
		);

		const result = await applyReleaseReset(gateway, plan);

		expect(result).toMatchObject({
			outcome: "refused",
			code: "state-changed-after-authorization",
		});
		expect(gateway.restoreRequests).toEqual([]);
		expect(gateway.removeRequests).toEqual([]);
	});

	it("restores exact tracked paths before removing the exact release directory", async () => {
		const gateway = new InMemoryReleaseResetGateway();
		const plan = requirePlan(await planReleaseReset(gateway, version));

		const result = await applyReleaseReset(gateway, plan);

		expect(result).toMatchObject({
			outcome: "reset",
			completedActions: [
				{ type: "restore-tracked-paths", paths: [manifestPath(0)] },
				{ type: "remove-release-directory", path: releaseDirectory },
			],
		});
		expect(gateway.restoreRequests).toEqual([[manifestPath(0)]]);
		expect(gateway.removeRequests).toEqual([releaseDirectory]);
		expect(gateway.operations.findIndex((entry) => entry.startsWith("restore:"))).toBeLessThan(
			gateway.operations.findIndex((entry) => entry.startsWith("remove:")),
		);
	});

	it("returns a retryable restoration failure without attempting artifact removal", async () => {
		const gateway = new InMemoryReleaseResetGateway({ restoreFailures: 1 });
		const plan = requirePlan(await planReleaseReset(gateway, version));

		const result = await applyReleaseReset(gateway, plan);

		expect(result).toMatchObject({
			outcome: "refused",
			code: "tracked-restore-failed",
			evidence: { completedActions: [] },
			failure: { code: "fake-restore-failed" },
		});
		expect(gateway.removeRequests).toEqual([]);
	});

	it("supports retry after tracked cleanup succeeds but artifact removal fails", async () => {
		const gateway = new InMemoryReleaseResetGateway({ removeFailures: 1 });
		const firstPlan = requirePlan(await planReleaseReset(gateway, version));

		const first = await applyReleaseReset(gateway, firstPlan);
		expect(first).toMatchObject({
			outcome: "refused",
			code: "release-directory-remove-failed",
			evidence: {
				trackedPathsToRestore: [],
				completedActions: [{ type: "restore-tracked-paths", paths: [manifestPath(0)] }],
			},
		});

		const retryPlan = requirePlan(await planReleaseReset(gateway, version));
		expect(retryPlan.plannedActions).toEqual([
			{ type: "remove-release-directory", path: releaseDirectory },
		]);
		const retry = await applyReleaseReset(gateway, retryPlan);
		expect(retry).toMatchObject({
			outcome: "reset",
			completedActions: [{ type: "remove-release-directory", path: releaseDirectory }],
		});
	});

	it("refuses without mutation when state changes after authorization", async () => {
		const gateway = new InMemoryReleaseResetGateway();
		const plan = requirePlan(await planReleaseReset(gateway, version));
		gateway.replaceInspection(inspection({ untrackedPaths: ["notes.txt"] }));

		const result = await applyReleaseReset(gateway, plan);

		expect(result).toMatchObject({
			outcome: "refused",
			code: "state-changed-after-authorization",
		});
		expect(gateway.restoreRequests).toEqual([]);
		expect(gateway.removeRequests).toEqual([]);
	});
});

describe("release reset hard refusals", () => {
	it.each(["checkpointing", "publishing", "published", "verified"] as const)(
		"refuses report stage %s",
		(stage) => {
			expectRefusal(
				classifyReleaseReset(version, inspection({ report: foundReport(report({ stage })) })),
				"report-stage-unsafe",
			);
		},
	);

	it("refuses an existing deterministic release branch", () => {
		expectRefusal(
			classifyReleaseReset(version, inspection({ releaseBranchExists: true })),
			"release-branch-exists",
		);
	});

	it.each([
		[
			"wrong source branch",
			inspection({
				report: foundReport(report({}, { branch: "another-source" })),
			}),
			"report-branch-mismatch",
		],
		[
			"wrong report version",
			inspection({ report: foundReport(report({}, { version: "9.9.9" })) }),
			"report-version-mismatch",
		],
		[
			"wrong report inventory",
			inspection({
				report: foundReport(report({ inventory: publicPublishOrder.slice(1) })),
			}),
			"report-inventory-mismatch",
		],
		[
			"completed write",
			inspection({
				report: foundReport(report({ completedWrites: ["@nseng-ai/sdk"] })),
			}),
			"report-has-completed-writes",
		],
		[
			"pending write",
			inspection({
				report: foundReport(report({ pendingWrite: "@nseng-ai/sdk" })),
			}),
			"report-has-pending-write",
		],
	] as const)("refuses %s", (_label, state, code) => {
		expectRefusal(classifyReleaseReset(version, state), code);
	});

	it.each([
		[
			"report read error",
			{
				type: "error",
				errorType: "read-error",
				error: { code: "report-read-failed", message: "EACCES" },
			} satisfies ReleaseResetReportState,
			"report-read-error",
		],
		[
			"corrupt report",
			{
				type: "error",
				errorType: "parse-error",
				error: { code: "report-invalid-json", message: "bad JSON" },
			} satisfies ReleaseResetReportState,
			"report-parse-error",
		],
	] as const)("refuses %s with structured guidance", (_label, reportState, code) => {
		const result = classifyReleaseReset(version, inspection({ report: reportState }));
		expect(result).toMatchObject({
			outcome: "refused",
			code,
			guidance: expect.any(String),
			failure: expect.any(Object),
		});
	});

	it("refuses a stale report commit that is not proven to be an ancestor of HEAD", () => {
		expectRefusal(
			classifyReleaseReset(
				version,
				inspection({
					report: foundReport(report({}, { commit: staleAncestorCommit }), false),
				}),
			),
			"report-commit-not-ancestor",
		);
	});

	it("accepts a canonical candidate prefix while candidates are preparing", () => {
		const result = classifyReleaseReset(
			version,
			inspection({
				report: foundReport(report({ candidates: canonicalCandidates().slice(0, 2) })),
			}),
		);

		expect(result.outcome).toBe("reset-planned");
	});

	it.each([
		["zero candidates", []],
		["partial candidates", canonicalCandidates().slice(0, -1)],
		[
			"duplicate candidates",
			canonicalCandidates().map((candidate, index) =>
				index === 1 ? { ...canonicalCandidate(0), order: 1 } : candidate,
			),
		],
		[
			"misordered candidates",
			canonicalCandidates().map((candidate, index) =>
				index === 0
					? { ...canonicalCandidate(1), order: 0 }
					: index === 1
						? { ...canonicalCandidate(0), order: 1 }
						: candidate,
			),
		],
		[
			"wrong candidate name",
			canonicalCandidates().map((candidate, index) =>
				index === 0 ? { ...candidate, name: "@nseng-ai/not-canonical" } : candidate,
			),
		],
		[
			"wrong candidate version",
			canonicalCandidates().map((candidate, index) =>
				index === 0 ? { ...candidate, version: "9.9.9" } : candidate,
			),
		],
		[
			"wrong candidate order",
			canonicalCandidates().map((candidate, index) =>
				index === 0 ? { ...candidate, order: 99 } : candidate,
			),
		],
		[
			"candidate outside the exact release directory",
			canonicalCandidates().map((candidate, index) =>
				index === 0 ? { ...candidate, tarballPath: "/tmp/outside.tgz" } : candidate,
			),
		],
	] as const)("refuses candidates-prepared with %s", (_label, candidates) => {
		expectRefusal(
			classifyReleaseReset(
				version,
				inspection({
					report: foundReport(report({ stage: "candidates-prepared", candidates })),
				}),
			),
			"report-candidate-inventory-mismatch",
		);
	});

	it("refuses a noncanonical source manifest inventory", () => {
		expectRefusal(
			classifyReleaseReset(version, inspection({ manifests: manifests([0]).slice(1) })),
			"manifest-inventory-mismatch",
		);
	});

	it("refuses an unexpected tracked path", () => {
		expectRefusal(
			classifyReleaseReset(
				version,
				inspection({
					changedIndexes: [],
					trackedChanges: [{ path: "README.md", indexChanged: false, worktreeChanged: true }],
				}),
			),
			"unexpected-tracked-path",
		);
	});

	it("refuses an unexpected tracked status even at a canonical release path", () => {
		expectRefusal(
			classifyReleaseReset(
				version,
				inspection({
					changedIndexes: [0],
					trackedChanges: [
						{
							path: manifestPath(0),
							indexChanged: true,
							worktreeChanged: false,
							isUnexpectedStatus: true,
						},
					],
				}),
			),
			"unexpected-tracked-path",
		);
	});

	it("refuses an unexpected untracked path", () => {
		expectRefusal(
			classifyReleaseReset(version, inspection({ untrackedPaths: ["scratch.txt"] })),
			"unexpected-untracked-path",
		);
	});

	it("refuses a non-version manifest edit", () => {
		const changed = manifests([0]).map((manifest, index) =>
			index === 0 ? { ...manifest, changedFields: ["version", "scripts"] } : manifest,
		);
		expectRefusal(
			classifyReleaseReset(version, inspection({ manifests: changed })),
			"manifest-non-version-change",
		);
	});

	it("refuses a byte-inexact manifest even when only version changed semantically", () => {
		const changed = manifests([0]).map((manifest, index) =>
			index === 0 ? { ...manifest, isExactVersionOnlyChange: false } : manifest,
		);
		expectRefusal(
			classifyReleaseReset(version, inspection({ manifests: changed })),
			"manifest-non-version-change",
		);
	});

	it("refuses a changed manifest with the wrong working version", () => {
		const changed = manifests([0]).map((manifest, index) =>
			index === 0 ? { ...manifest, workingVersion: "2.0.0" } : manifest,
		);
		expectRefusal(
			classifyReleaseReset(version, inspection({ manifests: changed })),
			"manifest-working-version-mismatch",
		);
	});

	it("refuses a non-concrete requested version", () => {
		expectRefusal(classifyReleaseReset("latest", inspection()), "invalid-version");
	});
});
