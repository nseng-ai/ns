import type {
	FlowBoundBranchPublicationTarget,
	FlowBranchPublicationClient,
} from "@nseng-ai/flow/api";

import type {
	ObjectiveRunnerBoundPublicationTarget,
	ObjectiveRunnerBranchPublisher,
	ObjectiveRunnerBranchPublisherResult,
} from "./publish.ts";

/** Adapts Objective policy vocabulary to Flow-owned branch/PR mutation mechanics. */
export function createObjectiveRunnerBranchPublisher(
	client: FlowBranchPublicationClient,
): ObjectiveRunnerBranchPublisher {
	return {
		publishBoundBranch: async (input) => {
			const result = await client.publishBoundBranch({
				target: toFlowTarget(input.target),
				expectedHeadOid: input.expectedHeadSha,
				objectiveSlug: input.objectiveSlug,
				managedBody: input.managedBody,
			});
			return fromFlowResult(result);
		},
	};
}

function toFlowTarget(
	target: ObjectiveRunnerBoundPublicationTarget,
): FlowBoundBranchPublicationTarget {
	return {
		branch: target.branch,
		pullRequest: {
			number: target.pullRequest.number,
			url: target.pullRequest.url,
			headRefName: target.pullRequest.headBranch,
			headOid: target.pullRequest.headSha,
		},
	};
}

function fromFlowResult(
	result: Awaited<ReturnType<FlowBranchPublicationClient["publishBoundBranch"]>>,
): ObjectiveRunnerBranchPublisherResult {
	if (result.type === "refused" || result.type === "push-failed") return result;
	const mapped = {
		type: result.type,
		headSha: result.headOid,
		target: {
			branch: result.target.branch,
			pullRequest: {
				number: result.target.pullRequest.number,
				url: result.target.pullRequest.url,
				headBranch: result.target.pullRequest.headRefName,
				headSha: result.target.pullRequest.headOid,
			},
		},
	};
	return result.type === "pushed-pr-update-failed"
		? { ...mapped, type: result.type, error: result.error }
		: { ...mapped, type: result.type };
}
