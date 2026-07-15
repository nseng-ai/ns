import { resolve } from "node:path";

import {
	intendedPublicPackages,
	isConcreteNpmVersion,
	publicPublishOrder,
	workspaceRoot,
} from "../public-packages/package-set.ts";

import type {
	FreshReleaseGateway,
	FreshReleaseState,
	OperationResult,
	PlanFreshReleaseResult,
	PrepareCandidatesContext,
	PrepareCandidatesOptions,
	PrepareCandidatesResult,
	QualifiedPublishRoot,
	ReleaseCandidate,
	ReleaseCheckpoint,
	ReleaseFailure,
	ReleaseTransactionReport,
	StartFreshReleaseContext,
	StartFreshReleaseOptions,
	StartFreshReleaseResult,
	ValueResult,
} from "./contracts.ts";

export async function planFreshRelease(
	release: FreshReleaseGateway,
	version: string,
): Promise<PlanFreshReleaseResult> {
	const versionResult = validateConcreteNpmVersion(version);
	if (!versionResult.ok) return { type: "refused", error: versionResult.error };
	const releaseBranch = releaseBranchName(version);
	const inspected = await release.inspectFreshState(releaseBranch);
	if (!inspected.ok) return { type: "refused", error: inspected.error };
	const preflightFailure = validateFreshState(inspected.value);
	if (preflightFailure !== undefined) return { type: "refused", error: preflightFailure };
	return {
		type: "planned",
		plan: {
			version,
			releaseBranch,
			stages: [
				"preflight",
				"bump-coordinated-version",
				"qualify-public-package-set",
				"freeze-candidates",
				"graphite-checkpoint",
				"classify-registry",
				"confirm-publish",
				"publish-tarballs",
				"verify-registry",
			],
			packages: orderedReleaseInventory(),
		},
	};
}

export function orderedReleaseInventory(): readonly string[] {
	assertInventory(publicPublishOrder, intendedPublicPackages);
	return [...publicPublishOrder];
}

/** Derives the one release branch name used by preflight and Graphite checkpoint creation. */
export function releaseBranchName(version: string): string {
	const sanitizedVersion = version.replaceAll(/[^0-9A-Za-z._-]/g, "-");
	return `transactional-npm-release/v${sanitizedVersion}`;
}

/**
 * Runs the mutating half of a fresh release through a dedicated Graphite checkpoint.
 * Failures deliberately leave prior bump, qualification, candidate, and Graphite effects intact.
 */
export async function startFreshRelease(
	context: StartFreshReleaseContext,
	options: StartFreshReleaseOptions,
): Promise<StartFreshReleaseResult> {
	const versionResult = validateConcreteNpmVersion(options.version);
	if (!versionResult.ok) return { type: "refused", error: versionResult.error };
	const branch = releaseBranchName(options.version);
	const inspected = await context.release.inspectFreshState(branch);
	if (!inspected.ok) return { type: "refused", error: inspected.error };
	const preflightFailure = validateFreshState(inspected.value);
	if (preflightFailure !== undefined) return { type: "refused", error: preflightFailure };

	const expectedPaths = [...inspected.value.sourceManifestPaths, "ts/pnpm-lock.yaml"].sort();
	const bump = await context.release.bumpCoordinatedVersion(options.version);
	if (!bump.ok) return { type: "refused", error: bump.error };
	const qualified = await context.release.qualifyPublicPackages(options.version);
	if (!qualified.ok) return { type: "refused", error: qualified.error };

	const prepared = await prepareFrozenCandidates(
		{ npmCandidates: context.npmCandidates, reports: context.reports },
		{
			identity: {
				branch: inspected.value.currentBranch,
				commit: inspected.value.headCommit,
				version: options.version,
			},
			publishRoots: qualified.value,
			reportPath: options.reportPath,
			...(options.releaseDirectory === undefined
				? {}
				: { releaseDirectory: options.releaseDirectory }),
		},
	);
	if (prepared.type === "refused") return { type: "refused", error: prepared.error };

	const changes = await context.release.listTrackedChanges();
	if (!changes.ok) return { type: "refused", error: changes.error };
	const changeFailure = validateExpectedChanges(changes.value, expectedPaths);
	if (changeFailure !== undefined) return { type: "refused", error: changeFailure };
	const staged = await context.release.stageReleaseFiles(expectedPaths);
	if (!staged.ok) return { type: "refused", error: staged.error };

	const checkpointingReport: ReleaseTransactionReport = {
		...prepared.report,
		release: { branch, commit: inspected.value.headCommit, version: options.version },
		stage: "checkpointing",
	};
	const checkpointingWrite = await context.reports.writeAtomic(
		options.reportPath,
		checkpointingReport,
	);
	if (!checkpointingWrite.ok) return { type: "refused", error: checkpointingWrite.error };

	const checkpoint = await context.release.createReleaseCheckpoint({
		branch,
		message: `Release public packages at ${options.version}`,
	});
	if (!checkpoint.ok) return { type: "refused", error: checkpoint.error };
	const checkpointFailure = validateCheckpoint(
		checkpoint.value,
		branch,
		inspected.value.headCommit,
	);
	if (checkpointFailure !== undefined) return { type: "refused", error: checkpointFailure };

	const persistedReport: ReleaseTransactionReport = {
		...checkpointingReport,
		release: { branch, commit: checkpoint.value.commit, version: options.version },
		stage: "candidates-prepared",
	};
	const persisted = await context.reports.writeAtomic(options.reportPath, persistedReport);
	if (!persisted.ok) return { type: "refused", error: persisted.error };
	const finalState = await context.release.inspectCheckpoint();
	if (!finalState.ok) return { type: "refused", error: finalState.error };
	const finalFailure = validateCheckpoint(finalState.value, branch, inspected.value.headCommit);
	if (finalFailure !== undefined) return { type: "refused", error: finalFailure };
	if (finalState.value.commit !== checkpoint.value.commit) {
		return {
			type: "refused",
			error: {
				code: "release-checkpoint-changed",
				message: "Release checkpoint identity changed while persisting the report",
			},
		};
	}
	return { type: "checkpointed", report: persistedReport };
}

export async function prepareFrozenCandidates(
	context: PrepareCandidatesContext,
	options: PrepareCandidatesOptions,
): Promise<PrepareCandidatesResult> {
	const inventory = orderedReleaseInventory();
	const rootsResult = orderPublishRoots(options.publishRoots, inventory);
	const initialReport: ReleaseTransactionReport = {
		schemaVersion: 1,
		release: options.identity,
		inventory,
		candidates: [],
		completedWrites: [],
		pendingWrite: null,
		stage: "preparing-candidates",
	};
	if (!rootsResult.ok) return { type: "refused", error: rootsResult.error, report: initialReport };

	const initialWrite = await context.reports.writeAtomic(options.reportPath, initialReport);
	if (!initialWrite.ok)
		return { type: "refused", error: initialWrite.error, report: initialReport };

	const packDestination =
		options.releaseDirectory ??
		resolve(workspaceRoot, "dist", "releases", options.identity.version);
	let report = initialReport;
	for (const [order, root] of rootsResult.value.entries()) {
		const packed = await context.npmCandidates.pack({ publishRoot: root.path, packDestination });
		if (!packed.ok) return { type: "refused", error: packed.error, report };
		if (packed.value.name !== root.name || packed.value.version !== options.identity.version) {
			return {
				type: "refused",
				error: {
					code: "candidate-identity-mismatch",
					message: `npm pack returned ${packed.value.name}@${packed.value.version}; expected ${root.name}@${options.identity.version}`,
				},
				report,
			};
		}
		const candidate: ReleaseCandidate = { ...packed.value, order };
		const candidateReport = { ...report, candidates: [...report.candidates, candidate] };
		const candidateWrite = await context.reports.writeAtomic(options.reportPath, candidateReport);
		if (!candidateWrite.ok) return { type: "refused", error: candidateWrite.error, report };
		report = candidateReport;
	}

	const completedReport: ReleaseTransactionReport = { ...report, stage: "candidates-prepared" };
	const finalWrite = await context.reports.writeAtomic(options.reportPath, completedReport);
	if (!finalWrite.ok) return { type: "refused", error: finalWrite.error, report };
	return { type: "prepared", report: completedReport };
}

function orderPublishRoots(
	publishRoots: readonly QualifiedPublishRoot[],
	inventory: readonly string[],
): ValueResult<readonly QualifiedPublishRoot[]> {
	const byName = new Map(publishRoots.map((root) => [root.name, root]));
	if (
		byName.size !== publishRoots.length ||
		!sameOrderedValues([...byName.keys()].sort(), [...inventory].sort())
	) {
		return {
			ok: false,
			error: {
				code: "publish-root-inventory-mismatch",
				message: "Qualified publish roots do not match the public package inventory",
			},
		};
	}
	return { ok: true, value: inventory.map((name) => requiredRoot(byName, name)) };
}

function requiredRoot(
	byName: ReadonlyMap<string, QualifiedPublishRoot>,
	name: string,
): QualifiedPublishRoot {
	const root = byName.get(name);
	if (root === undefined)
		throw new Error(`Missing qualified publish root after inventory validation: ${name}`);
	return root;
}

function assertInventory(order: readonly string[], intended: readonly string[]): void {
	if (
		new Set(order).size !== order.length ||
		!sameOrderedValues([...order].sort(), [...intended].sort())
	) {
		throw new Error(
			"Public publish order does not exactly match the intended public package inventory",
		);
	}
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateConcreteNpmVersion(version: string): OperationResult {
	if (isConcreteNpmVersion(version)) return { ok: true, value: undefined };
	return {
		ok: false,
		error: {
			code: "invalid-release-version",
			message: `Release version must be a concrete npm semver, got: ${version}`,
		},
	};
}

function validateFreshState(state: FreshReleaseState): ReleaseFailure | undefined {
	if (!state.isWorktreeClean) {
		return {
			code: "release-worktree-dirty",
			message: "A fresh release requires an initially clean worktree",
		};
	}
	if (state.currentBranch === state.trunkBranch) {
		return {
			code: "release-on-trunk",
			message: `A release cannot start from resolved Graphite trunk ${state.trunkBranch}`,
		};
	}
	if (!state.isGraphiteTracked) {
		return {
			code: "release-branch-untracked",
			message: `Current branch ${state.currentBranch} is not tracked by Graphite`,
		};
	}
	if (state.releaseBranchExists) {
		return {
			code: "release-branch-collision",
			message: "The deterministic release branch already exists",
		};
	}
	if (
		state.sourceManifestPaths.length !== intendedPublicPackages.length ||
		new Set(state.sourceManifestPaths).size !== state.sourceManifestPaths.length
	) {
		return {
			code: "release-manifest-inventory-mismatch",
			message: "Canonical source manifests do not match the intended public package inventory",
		};
	}
	return undefined;
}

function validateExpectedChanges(
	actualPaths: readonly string[],
	expectedPaths: readonly string[],
): ReleaseFailure | undefined {
	const actual = [...new Set(actualPaths)].sort();
	const expected = [...new Set(expectedPaths)].sort();
	if (sameOrderedValues(actual, expected)) return undefined;
	const actualSet = new Set(actual);
	const expectedSet = new Set(expected);
	const missing = expected.filter((path) => !actualSet.has(path));
	const unexpected = actual.filter((path) => !expectedSet.has(path));
	return {
		code: "release-change-set-mismatch",
		message: `Release tracked changes are not exact. Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`,
	};
}

function validateCheckpoint(
	checkpoint: ReleaseCheckpoint,
	expectedBranch: string,
	previousCommit: string,
): ReleaseFailure | undefined {
	if (checkpoint.branch !== expectedBranch || checkpoint.commit === previousCommit) {
		return {
			code: "release-checkpoint-identity-mismatch",
			message: "Graphite did not create the requested dedicated release branch and commit",
		};
	}
	if (!checkpoint.isWorktreeClean) {
		return {
			code: "release-checkpoint-dirty",
			message: "Release worktree is not clean after the Graphite checkpoint",
		};
	}
	return undefined;
}
