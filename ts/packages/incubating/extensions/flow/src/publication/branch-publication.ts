import { mergeObjectiveRunnerRegion } from "./managed-objective-runner-region.ts";

export interface FlowPublicationError {
	code: string;
	message: string;
	displayCommand?: string;
}

export type FlowPublicationGatewayResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: FlowPublicationError };

export interface FlowPublicationRepositoryState {
	branch: string;
	headOid: string;
}

export interface FlowBoundBranchPublicationPullRequest {
	number: number;
	url: string;
	headRefName: string;
	headOid: string;
}

export interface FlowBoundBranchPublicationTarget {
	branch: string;
	pullRequest: FlowBoundBranchPublicationPullRequest;
}

export interface FlowPublicationPullRequest extends FlowBoundBranchPublicationPullRequest {
	body: string;
}

export interface FlowPublicationRepositoryGateway {
	readCurrentBranch(): Promise<FlowPublicationGatewayResult<FlowPublicationRepositoryState>>;
	publishBranch(input: {
		branch: string;
		expectedHeadOid: string;
	}): Promise<FlowPublicationGatewayResult<void>>;
}

export interface FlowPublicationPullRequestGateway {
	readCurrentBranchPullRequest(): Promise<FlowPublicationGatewayResult<FlowPublicationPullRequest>>;
	readPullRequest(
		number: number,
	): Promise<FlowPublicationGatewayResult<FlowPublicationPullRequest>>;
	replacePullRequestBody(input: {
		number: number;
		body: string;
	}): Promise<FlowPublicationGatewayResult<void>>;
}

export interface FlowBranchPublicationContext {
	repository: FlowPublicationRepositoryGateway;
	pullRequests: FlowPublicationPullRequestGateway;
}

export type ResolveFlowBranchPublicationTargetResult =
	| { type: "resolved"; target: FlowBoundBranchPublicationTarget; localHeadOid: string }
	| { type: "refused"; reason: string; error: FlowPublicationError };

export type PublishFlowBranchResult =
	| { type: "refused"; reason: string; error: FlowPublicationError }
	| { type: "push-failed"; error: FlowPublicationError }
	| {
			type: "published";
			headOid: string;
			target: FlowBoundBranchPublicationTarget;
	  }
	| {
			type: "pushed-pr-update-failed";
			headOid: string;
			target: FlowBoundBranchPublicationTarget;
			error: FlowPublicationError;
	  };

export interface FlowBranchPublicationClient {
	resolveCurrentBranchTarget(input: {
		trunkBranch: string;
	}): Promise<ResolveFlowBranchPublicationTargetResult>;
	publishBoundBranch(input: {
		target: FlowBoundBranchPublicationTarget;
		expectedHeadOid: string;
		objectiveSlug: string;
		managedBody: string;
	}): Promise<PublishFlowBranchResult>;
}

export function createFlowBranchPublicationClientFromGateways(
	context: FlowBranchPublicationContext,
): FlowBranchPublicationClient {
	return {
		resolveCurrentBranchTarget: async (input) => await resolveCurrentBranchTarget(context, input),
		publishBoundBranch: async (input) => await publishBoundBranch(context, input),
	};
}

async function resolveCurrentBranchTarget(
	context: FlowBranchPublicationContext,
	input: { trunkBranch: string },
): Promise<ResolveFlowBranchPublicationTargetResult> {
	const repository = await context.repository.readCurrentBranch();
	if (!repository.ok) return refusal("repository-read-failed", repository.error);
	if (repository.value.branch === input.trunkBranch) {
		return refusal("trunk-branch", {
			code: "flow_publication_trunk_branch",
			message: `Branch publication refuses trunk branch ${input.trunkBranch}.`,
		});
	}

	const pullRequest = await context.pullRequests.readCurrentBranchPullRequest();
	if (!pullRequest.ok) return refusal("pull-request-read-failed", pullRequest.error);
	if (pullRequest.value.headRefName !== repository.value.branch) {
		return refusal("pull-request-head-mismatch", {
			code: "flow_publication_pr_head_mismatch",
			message: `PR #${pullRequest.value.number} targets ${pullRequest.value.headRefName}, not current branch ${repository.value.branch}.`,
		});
	}
	return {
		type: "resolved",
		localHeadOid: repository.value.headOid,
		target: targetFrom(pullRequest.value, repository.value.branch),
	};
}

async function publishBoundBranch(
	context: FlowBranchPublicationContext,
	input: {
		target: FlowBoundBranchPublicationTarget;
		expectedHeadOid: string;
		objectiveSlug: string;
		managedBody: string;
	},
): Promise<PublishFlowBranchResult> {
	const repository = await context.repository.readCurrentBranch();
	if (!repository.ok) return refusal("repository-read-failed", repository.error);
	if (repository.value.branch !== input.target.branch) {
		return refusal("branch-drift", {
			code: "flow_publication_branch_drift",
			message: `Current branch ${repository.value.branch} does not match bound branch ${input.target.branch}.`,
		});
	}
	if (repository.value.headOid !== input.expectedHeadOid) {
		return refusal("local-head-drift", {
			code: "flow_publication_local_head_drift",
			message: `Current HEAD ${repository.value.headOid} does not match expected publish HEAD ${input.expectedHeadOid}.`,
		});
	}

	const beforePush = await context.pullRequests.readPullRequest(input.target.pullRequest.number);
	if (!beforePush.ok) return refusal("pull-request-read-failed", beforePush.error);
	const targetMismatch = compareTarget(input.target, beforePush.value);
	if (targetMismatch !== undefined) return refusal("pull-request-drift", targetMismatch);
	const preflightBody = mergeObjectiveRunnerRegion({
		existingBody: beforePush.value.body,
		objectiveSlug: input.objectiveSlug,
		managedBody: input.managedBody,
	});
	if (preflightBody.type === "refused") {
		return refusal(preflightBody.reason, {
			code: `flow_publication_${preflightBody.reason.replaceAll("-", "_")}`,
			message: preflightBody.message,
		});
	}

	const push = await context.repository.publishBranch({
		branch: input.target.branch,
		expectedHeadOid: input.expectedHeadOid,
	});
	if (!push.ok) return { type: "push-failed", error: push.error };

	const nextTarget: FlowBoundBranchPublicationTarget = {
		...input.target,
		pullRequest: { ...input.target.pullRequest, headOid: input.expectedHeadOid },
	};
	const afterPush = await context.pullRequests.readPullRequest(input.target.pullRequest.number);
	if (!afterPush.ok) {
		return partial(nextTarget, input.expectedHeadOid, afterPush.error);
	}
	const postPushMismatch = comparePublishedTarget(nextTarget, afterPush.value);
	if (postPushMismatch !== undefined) {
		return partial(nextTarget, input.expectedHeadOid, postPushMismatch);
	}
	const merged = mergeObjectiveRunnerRegion({
		existingBody: afterPush.value.body,
		objectiveSlug: input.objectiveSlug,
		managedBody: input.managedBody,
	});
	if (merged.type === "refused") {
		return partial(nextTarget, input.expectedHeadOid, {
			code: `flow_publication_${merged.reason.replaceAll("-", "_")}`,
			message: merged.message,
		});
	}
	const edit = await context.pullRequests.replacePullRequestBody({
		number: afterPush.value.number,
		body: merged.body,
	});
	if (!edit.ok) return partial(nextTarget, input.expectedHeadOid, edit.error);
	return { type: "published", headOid: input.expectedHeadOid, target: nextTarget };
}

function compareTarget(
	target: FlowBoundBranchPublicationTarget,
	actual: FlowPublicationPullRequest,
): FlowPublicationError | undefined {
	if (
		actual.number === target.pullRequest.number &&
		actual.url === target.pullRequest.url &&
		actual.headRefName === target.pullRequest.headRefName &&
		actual.headOid === target.pullRequest.headOid
	) {
		return undefined;
	}
	return {
		code: "flow_publication_pr_drift",
		message: `PR #${target.pullRequest.number} no longer matches the bound head ${target.pullRequest.headRefName}@${target.pullRequest.headOid}.`,
	};
}

function comparePublishedTarget(
	target: FlowBoundBranchPublicationTarget,
	actual: FlowPublicationPullRequest,
): FlowPublicationError | undefined {
	if (
		actual.number === target.pullRequest.number &&
		actual.url === target.pullRequest.url &&
		actual.headRefName === target.pullRequest.headRefName &&
		actual.headOid === target.pullRequest.headOid
	) {
		return undefined;
	}
	return {
		code: "flow_publication_published_pr_drift",
		message: `After push, PR #${target.pullRequest.number} did not report ${target.pullRequest.headRefName}@${target.pullRequest.headOid}.`,
	};
}

function targetFrom(
	pullRequest: FlowPublicationPullRequest,
	branch: string,
): FlowBoundBranchPublicationTarget {
	return {
		branch,
		pullRequest: {
			number: pullRequest.number,
			url: pullRequest.url,
			headRefName: pullRequest.headRefName,
			headOid: pullRequest.headOid,
		},
	};
}

function refusal(reason: string, error: FlowPublicationError) {
	return { type: "refused" as const, reason, error };
}

function partial(
	target: FlowBoundBranchPublicationTarget,
	headOid: string,
	error: FlowPublicationError,
): PublishFlowBranchResult {
	return { type: "pushed-pr-update-failed", target, headOid, error };
}
