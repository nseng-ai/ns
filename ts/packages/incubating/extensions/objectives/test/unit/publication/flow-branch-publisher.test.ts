import { describe, expect, test } from "vitest";

import type {
	FlowBranchPublicationClient,
	PublishFlowBranchResult,
	ResolveFlowBranchPublicationTargetResult,
} from "@nseng-ai/flow/api";

import { createObjectiveRunnerBranchPublisher } from "../../../src/publication/flow-branch-publisher.ts";

const OLD_SHA = "1".repeat(40);
const NEW_SHA = "2".repeat(40);

class RecordingFlowClient implements FlowBranchPublicationClient {
	readonly calls: Array<Parameters<FlowBranchPublicationClient["publishBoundBranch"]>[0]> = [];
	private readonly result: PublishFlowBranchResult;

	constructor(result: PublishFlowBranchResult) {
		this.result = result;
	}

	async resolveCurrentBranchTarget(): Promise<ResolveFlowBranchPublicationTargetResult> {
		throw new Error("The Objective publisher does not resolve a new target after authorization.");
	}

	async publishBoundBranch(
		input: Parameters<FlowBranchPublicationClient["publishBoundBranch"]>[0],
	): Promise<PublishFlowBranchResult> {
		this.calls.push(structuredClone(input));
		return structuredClone(this.result);
	}
}

describe("createObjectiveRunnerBranchPublisher", () => {
	test("maps the authorization-bound target through the curated Flow API", async () => {
		const client = new RecordingFlowClient({
			type: "pushed-pr-update-failed",
			headOid: NEW_SHA,
			target: flowTarget(NEW_SHA),
			error: { code: "edit-failed", message: "GitHub unavailable" },
		});
		const publisher = createObjectiveRunnerBranchPublisher(client);

		const result = await publisher.publishBoundBranch({
			target: {
				branch: "feature/publication",
				pullRequest: {
					number: 42,
					url: "https://github.com/nseng-ai/ns/pull/42",
					headBranch: "feature/publication",
					headSha: OLD_SHA,
				},
			},
			expectedHeadSha: NEW_SHA,
			objectiveSlug: "objective-runner-external-writes",
			managedBody: "## Objective Runner\n",
		});

		expect(client.calls).toEqual([
			{
				target: flowTarget(OLD_SHA),
				expectedHeadOid: NEW_SHA,
				objectiveSlug: "objective-runner-external-writes",
				managedBody: "## Objective Runner\n",
			},
		]);
		expect(result).toEqual({
			type: "pushed-pr-update-failed",
			headSha: NEW_SHA,
			target: {
				branch: "feature/publication",
				pullRequest: {
					number: 42,
					url: "https://github.com/nseng-ai/ns/pull/42",
					headBranch: "feature/publication",
					headSha: NEW_SHA,
				},
			},
			error: { code: "edit-failed", message: "GitHub unavailable" },
		});
	});
});

function flowTarget(headOid: string) {
	return {
		branch: "feature/publication",
		pullRequest: {
			number: 42,
			url: "https://github.com/nseng-ai/ns/pull/42",
			headRefName: "feature/publication",
			headOid,
		},
	};
}
