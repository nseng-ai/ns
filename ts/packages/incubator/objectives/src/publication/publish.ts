import type { ObjectiveRunnerPublicationAuthorizationV1 } from "./contracts.ts";
import {
	recheckObjectiveRunnerPublication,
	type PublicationAuthorizationRefusalCode,
} from "./authorization.ts";
import type { ObjectiveRunnerPublicationFactsGateway } from "./facts-gateway.ts";
import { renderObjectiveRunnerCumulativeSummary } from "./summary.ts";

export interface ObjectiveRunnerPublicationError {
	code: string;
	message: string;
	displayCommand?: string;
}

export interface ObjectiveRunnerBoundPublicationTarget {
	branch: string;
	pullRequest: {
		number: number;
		url: string;
		headBranch: string;
		headSha: string;
	};
}

export type ObjectiveRunnerBranchPublisherResult =
	| { type: "refused"; reason: string; error: ObjectiveRunnerPublicationError }
	| { type: "push-failed"; error: ObjectiveRunnerPublicationError }
	| {
			type: "published";
			headSha: string;
			target: ObjectiveRunnerBoundPublicationTarget;
	  }
	| {
			type: "pushed-pr-update-failed";
			headSha: string;
			target: ObjectiveRunnerBoundPublicationTarget;
			error: ObjectiveRunnerPublicationError;
	  };

/** Mutation Consumer Gateway kept in Objective publication vocabulary. */
export interface ObjectiveRunnerBranchPublisher {
	publishBoundBranch(input: {
		target: ObjectiveRunnerBoundPublicationTarget;
		expectedHeadSha: string;
		objectiveSlug: string;
		managedBody: string;
	}): Promise<ObjectiveRunnerBranchPublisherResult>;
}

export interface PublishObjectiveRunnerCheckpointOptions {
	repoRoot: string;
	invocationId: string;
	objectiveSlug: string;
	authorization: unknown;
	summary: unknown;
	checkpoint: unknown;
}

export type PublishObjectiveRunnerCheckpointResult =
	| {
			type: "refused";
			code: PublicationAuthorizationRefusalCode;
			message: string;
	  }
	| { type: "publication-refused"; reason: string; error: ObjectiveRunnerPublicationError }
	| { type: "push-failed"; error: ObjectiveRunnerPublicationError }
	| {
			type: "published";
			headSha: string;
			target: ObjectiveRunnerBoundPublicationTarget;
			nextAuthorization: ObjectiveRunnerPublicationAuthorizationV1;
	  }
	| {
			type: "pushed-pr-update-failed";
			headSha: string;
			target: ObjectiveRunnerBoundPublicationTarget;
			error: ObjectiveRunnerPublicationError;
			nextAuthorization: ObjectiveRunnerPublicationAuthorizationV1;
	  };

/** Publishes only after Objective-owned authorization and checkpoint rechecks pass. */
export async function publishObjectiveRunnerCheckpoint(
	facts: ObjectiveRunnerPublicationFactsGateway,
	publisher: ObjectiveRunnerBranchPublisher,
	options: PublishObjectiveRunnerCheckpointOptions,
): Promise<PublishObjectiveRunnerCheckpointResult> {
	const rechecked = await recheckObjectiveRunnerPublication(facts, options);
	if (!rechecked.ok) {
		return {
			type: "refused",
			code: rechecked.refusal.code,
			message: rechecked.refusal.message,
		};
	}

	const { authorization, summary } = rechecked.value;
	const result = await publisher.publishBoundBranch({
		target: {
			branch: authorization.target.branch,
			pullRequest: {
				number: authorization.target.pullRequestNumber,
				url: authorization.target.pullRequestUrl,
				headBranch: authorization.target.headBranch,
				headSha: authorization.lastPublishedHead,
			},
		},
		expectedHeadSha: summary.publishedHead,
		objectiveSlug: authorization.objectiveSlug,
		managedBody: renderObjectiveRunnerCumulativeSummary(summary),
	});

	if (result.type === "refused") {
		return { type: "publication-refused", reason: result.reason, error: result.error };
	}
	if (result.type === "push-failed") return result;

	const nextAuthorization = {
		...authorization,
		lastPublishedHead: result.headSha,
	};
	if (result.type === "pushed-pr-update-failed") {
		return { ...result, nextAuthorization };
	}
	return { ...result, nextAuthorization };
}
