import {
	objectiveRunnerCumulativeSummaryV1Schema,
	objectiveRunnerPublicationAuthorizationV1Schema,
	objectiveRunnerPublicationCheckpointSchema,
	objectiveRunnerPublicationLaunchAttestationV1Schema,
	type ObjectiveRunnerCumulativeSummaryV1,
	type ObjectiveRunnerPublicationAuthorizationV1,
	type ObjectiveRunnerPublicationCheckpoint,
	type ObjectiveRunnerPublicationLaunchAttestationV1,
	type PublicationCommitFacts,
	type PublicationTargetFacts,
} from "./contracts.ts";
import type { ObjectiveRunnerPublicationFactsGateway } from "./facts-gateway.ts";

export type PublicationAuthorizationRefusalCode =
	| "invalid-attestation"
	| "target-unavailable"
	| "target-facts-failed"
	| "trunk-branch"
	| "branch-drift"
	| "pull-request-mismatch"
	| "local-head-drift"
	| "remote-head-drift"
	| "dirty-worktree"
	| "invalid-authorization"
	| "invalid-summary"
	| "objective-mismatch"
	| "invocation-mismatch"
	| "unverified-checkpoint"
	| "checkpoint-summary-mismatch"
	| "commit-facts-failed"
	| "non-descendant-history"
	| "commit-range-mismatch"
	| "runner-trailer-mismatch";

export type PublicationAuthorizationResult<T> =
	| { ok: true; value: T }
	| {
			ok: false;
			refusal: { code: PublicationAuthorizationRefusalCode; message: string };
	  };

export interface BindObjectiveRunnerPublicationOptions {
	repoRoot: string;
	attestation: unknown;
}

/** Binds one invocation only after exact launch facts match the human attestation. */
export async function bindObjectiveRunnerPublication(
	gateway: ObjectiveRunnerPublicationFactsGateway,
	options: BindObjectiveRunnerPublicationOptions,
): Promise<PublicationAuthorizationResult<ObjectiveRunnerPublicationAuthorizationV1>> {
	const parsed = objectiveRunnerPublicationLaunchAttestationV1Schema.safeParse(options.attestation);
	if (!parsed.success) {
		return refusal(
			"invalid-attestation",
			"Publication requires a valid version 1 launch attestation.",
		);
	}

	const target = await gateway.readPublicationTarget({ repoRoot: options.repoRoot });
	if (target.type === "missing") {
		return refusal("target-unavailable", "The current branch has no existing pull request.");
	}
	if (target.type === "error") {
		return refusal("target-facts-failed", target.error.message);
	}
	const targetRefusal = validateTarget(parsed.data, target.value, {
		expectedLocalHead: parsed.data.launchHead,
		expectedRemoteHead: parsed.data.remoteHead,
	});
	if (targetRefusal !== null) return targetRefusal;

	return {
		ok: true,
		value: {
			version: 1,
			invocationId: parsed.data.invocationId,
			objectiveSlug: parsed.data.objectiveSlug,
			policyAttested: true,
			launchConfirmed: true,
			target: parsed.data.target,
			launchHead: parsed.data.launchHead,
			lastPublishedHead: parsed.data.remoteHead,
		},
	};
}

export interface RecheckObjectiveRunnerPublicationOptions {
	repoRoot: string;
	invocationId: string;
	objectiveSlug: string;
	authorization: unknown;
	summary: unknown;
	checkpoint: unknown;
}

export interface RecheckedObjectiveRunnerPublication {
	authorization: ObjectiveRunnerPublicationAuthorizationV1;
	summary: ObjectiveRunnerCumulativeSummaryV1;
	checkpoint: ObjectiveRunnerPublicationCheckpoint;
}

/** Rechecks all bound target, checkpoint, commit, trailer, and ancestry facts before mutation. */
export async function recheckObjectiveRunnerPublication(
	gateway: ObjectiveRunnerPublicationFactsGateway,
	options: RecheckObjectiveRunnerPublicationOptions,
): Promise<PublicationAuthorizationResult<RecheckedObjectiveRunnerPublication>> {
	const authorization = objectiveRunnerPublicationAuthorizationV1Schema.safeParse(
		options.authorization,
	);
	if (!authorization.success) {
		return refusal("invalid-authorization", "Publication authorization is missing or invalid.");
	}
	if (authorization.data.objectiveSlug !== options.objectiveSlug) {
		return refusal(
			"objective-mismatch",
			"Publication authorization belongs to a different Objective.",
		);
	}
	if (authorization.data.invocationId !== options.invocationId) {
		return refusal(
			"invocation-mismatch",
			"Publication authorization belongs to a different autorun invocation.",
		);
	}
	const summary = objectiveRunnerCumulativeSummaryV1Schema.safeParse(options.summary);
	if (!summary.success) {
		return refusal("invalid-summary", "The cumulative publication summary is invalid.");
	}
	const checkpoint = objectiveRunnerPublicationCheckpointSchema.safeParse(options.checkpoint);
	if (!checkpoint.success || !checkpoint.data.isVerified) {
		return refusal("unverified-checkpoint", "Publication requires a verified Runner Checkpoint.");
	}
	if (summary.data.objectiveSlug !== authorization.data.objectiveSlug) {
		return refusal("objective-mismatch", "The cumulative summary names a different Objective.");
	}

	const target = await gateway.readPublicationTarget({ repoRoot: options.repoRoot });
	if (target.type === "missing") {
		return refusal("target-unavailable", "The bound pull request no longer exists.");
	}
	if (target.type === "error") {
		return refusal("target-facts-failed", target.error.message);
	}
	const targetRefusal = validateTarget(authorization.data, target.value, {
		expectedLocalHead: summary.data.publishedHead,
		expectedRemoteHead: authorization.data.lastPublishedHead,
	});
	if (targetRefusal !== null) return targetRefusal;

	const expectedRunnerCommits = summary.data.steps.map((step) => step.runnerCommitSha);
	const expectedTrackingCommits = summary.data.objectiveTrackingCommits.map((commit) => commit.sha);
	if (
		!isOrderedSubset(checkpoint.data.runnerCommitShas, expectedRunnerCommits) ||
		!isOrderedSubset(checkpoint.data.objectiveTrackingCommitShas, expectedTrackingCommits)
	) {
		return refusal(
			"checkpoint-summary-mismatch",
			"The cumulative summary does not match the parent-attested checkpoint commits.",
		);
	}

	const commits = await gateway.readPublicationCommits({
		repoRoot: options.repoRoot,
		lastPublishedHead: authorization.data.lastPublishedHead,
		intendedPublishedHead: summary.data.publishedHead,
	});
	if (!commits.ok) return refusal("commit-facts-failed", commits.error.message);
	const commitRefusal = validateCommits(
		authorization.data,
		summary.data,
		checkpoint.data,
		commits.value,
	);
	if (commitRefusal !== null) return commitRefusal;

	return {
		ok: true,
		value: {
			authorization: authorization.data,
			summary: summary.data,
			checkpoint: checkpoint.data,
		},
	};
}

function validateTarget(
	binding:
		| ObjectiveRunnerPublicationLaunchAttestationV1
		| ObjectiveRunnerPublicationAuthorizationV1,
	facts: PublicationTargetFacts,
	expectedHeads: { expectedLocalHead: string; expectedRemoteHead: string },
): PublicationAuthorizationResult<never> | null {
	if (facts.isTrunk) return refusal("trunk-branch", "Publication is forbidden from trunk.");
	if (facts.branch !== binding.target.branch) {
		return refusal("branch-drift", "The current branch differs from the bound branch.");
	}
	if (facts.pullRequest === null) {
		return refusal("target-unavailable", "The bound pull request no longer exists.");
	}
	if (
		facts.repository !== binding.target.repository ||
		facts.pullRequest.number !== binding.target.pullRequestNumber ||
		facts.pullRequest.headBranch !== binding.target.headBranch ||
		facts.pullRequest.headBranch !== facts.branch
	) {
		return refusal(
			"pull-request-mismatch",
			"The existing pull request differs from the bound target.",
		);
	}
	if (facts.localHead !== expectedHeads.expectedLocalHead) {
		return refusal("local-head-drift", "Local HEAD differs from the intended publication head.");
	}
	if (facts.pullRequest.headSha !== expectedHeads.expectedRemoteHead) {
		return refusal("remote-head-drift", "The pull request head moved since the last bound head.");
	}
	if (!facts.isWorktreeClean) {
		return refusal("dirty-worktree", "The worktree must be clean before publication.");
	}
	return null;
}

function validateCommits(
	authorization: ObjectiveRunnerPublicationAuthorizationV1,
	summary: ObjectiveRunnerCumulativeSummaryV1,
	checkpoint: ObjectiveRunnerPublicationCheckpoint,
	facts: PublicationCommitFacts,
): PublicationAuthorizationResult<never> | null {
	if (
		facts.lastPublishedHead !== authorization.lastPublishedHead ||
		facts.intendedPublishedHead !== summary.publishedHead ||
		!facts.isLastPublishedHeadAncestor
	) {
		return refusal(
			"non-descendant-history",
			"The intended publication head is not a descendant of the last published head.",
		);
	}
	const expected = [
		...checkpoint.runnerCommitShas,
		...checkpoint.objectiveTrackingCommitShas,
	].sort();
	const observed = facts.commits.map((commit) => commit.sha).sort();
	if (!sameOrderedValues(expected, observed)) {
		return refusal(
			"commit-range-mismatch",
			"The publication commit range contains unexpected commits.",
		);
	}
	const runnerShas = new Set(checkpoint.runnerCommitShas);
	for (const commit of facts.commits) {
		const isRunnerCommit = runnerShas.has(commit.sha);
		const hasExpectedTrailer =
			commit.objectiveRunnerStepTrailers.length === 1 &&
			commit.objectiveRunnerStepTrailers[0] === authorization.objectiveSlug;
		if (isRunnerCommit !== hasExpectedTrailer) {
			return refusal(
				"runner-trailer-mismatch",
				"Runner commit provenance trailers do not match the authorized Objective.",
			);
		}
	}
	return null;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isOrderedSubset(subset: readonly string[], complete: readonly string[]): boolean {
	let completeIndex = 0;
	for (const value of subset) {
		const foundIndex = complete.indexOf(value, completeIndex);
		if (foundIndex === -1) return false;
		completeIndex = foundIndex + 1;
	}
	return true;
}

function refusal<T>(
	code: PublicationAuthorizationRefusalCode,
	message: string,
): PublicationAuthorizationResult<T> {
	return { ok: false, refusal: { code, message } };
}
