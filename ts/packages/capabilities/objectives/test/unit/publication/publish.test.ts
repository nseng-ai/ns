import { describe, expect, test } from "vitest";

import type {
	ObjectiveRunnerCumulativeSummaryV1,
	ObjectiveRunnerPublicationAuthorizationV1,
	PublicationCommitFacts,
	PublicationTargetFacts,
} from "../../../src/publication/contracts.ts";
import type {
	ObjectiveRunnerPublicationFactsGateway,
	PublicationFactsResult,
	PublicationTargetFactsResult,
} from "../../../src/publication/facts-gateway.ts";
import {
	publishObjectiveRunnerCheckpoint,
	type ObjectiveRunnerBranchPublisher,
	type ObjectiveRunnerBranchPublisherResult,
} from "../../../src/publication/publish.ts";

const BASE_SHA = "1".repeat(40);
const RUNNER_SHA = "2".repeat(40);
const TRACKING_SHA = "3".repeat(40);
const NEXT_RUNNER_SHA = "4".repeat(40);
const NEXT_HEAD_SHA = "5".repeat(40);
const SLUG = "objective-runner-external-writes";
const PR_URL = "https://github.com/nseng-ai/ns/pull/42";

class FakeFacts implements ObjectiveRunnerPublicationFactsGateway {
	readonly reads: string[] = [];
	private readonly target: PublicationTargetFacts;
	private readonly commits: PublicationCommitFacts;

	constructor(options: { target?: PublicationTargetFacts; commits?: PublicationCommitFacts } = {}) {
		this.target = options.target ?? targetFacts();
		this.commits = options.commits ?? commitFacts();
	}

	async readPublicationTarget(): Promise<PublicationTargetFactsResult> {
		this.reads.push("target");
		return { type: "found", value: structuredClone(this.target) };
	}

	async readPublicationCommits(): Promise<PublicationFactsResult<PublicationCommitFacts>> {
		this.reads.push("commits");
		return { ok: true, value: structuredClone(this.commits) };
	}
}

class RecordingPublisher implements ObjectiveRunnerBranchPublisher {
	readonly calls: Array<Parameters<ObjectiveRunnerBranchPublisher["publishBoundBranch"]>[0]> = [];
	private readonly result: ObjectiveRunnerBranchPublisherResult;

	constructor(result: ObjectiveRunnerBranchPublisherResult) {
		this.result = result;
	}

	async publishBoundBranch(
		input: Parameters<ObjectiveRunnerBranchPublisher["publishBoundBranch"]>[0],
	): Promise<ObjectiveRunnerBranchPublisherResult> {
		this.calls.push(structuredClone(input));
		return structuredClone(this.result);
	}
}

describe("publishObjectiveRunnerCheckpoint", () => {
	test("rechecks and renders before publishing the exact bound target", async () => {
		const facts = new FakeFacts();
		const publisher = new RecordingPublisher(publishedResult());

		const result = await publishObjectiveRunnerCheckpoint(facts, publisher, options());

		expect(result).toMatchObject({
			type: "published",
			headSha: TRACKING_SHA,
			nextAuthorization: { lastPublishedHead: TRACKING_SHA },
		});
		expect(facts.reads).toEqual(["target", "commits"]);
		expect(publisher.calls).toEqual([
			expect.objectContaining({
				expectedHeadSha: TRACKING_SHA,
				objectiveSlug: SLUG,
				target: expectedTarget(BASE_SHA),
				managedBody: expect.stringContaining(`- Published head: \`${TRACKING_SHA}\``),
			}),
		]);
	});

	test("does not invoke the publisher when checkpoint authorization is refused", async () => {
		const facts = new FakeFacts();
		const publisher = new RecordingPublisher(publishedResult());

		const result = await publishObjectiveRunnerCheckpoint(facts, publisher, {
			...options(),
			checkpoint: { ...checkpoint(), isVerified: false },
		});

		expect(result).toMatchObject({ type: "refused", code: "unverified-checkpoint" });
		expect(facts.reads).toEqual([]);
		expect(publisher.calls).toEqual([]);
	});

	test("does not advance authorization when the push fails", async () => {
		const publisher = new RecordingPublisher({
			type: "push-failed",
			error: { code: "push-rejected", message: "non-fast-forward" },
		});

		const result = await publishObjectiveRunnerCheckpoint(new FakeFacts(), publisher, options());

		expect(result).toEqual({
			type: "push-failed",
			error: { code: "push-rejected", message: "non-fast-forward" },
		});
		expect(result).not.toHaveProperty("nextAuthorization");
	});

	test("advances authorization after push even when the PR update fails", async () => {
		const publisher = new RecordingPublisher({
			type: "pushed-pr-update-failed",
			headSha: TRACKING_SHA,
			target: expectedTarget(TRACKING_SHA),
			error: { code: "pr-edit-failed", message: "GitHub unavailable" },
		});

		const result = await publishObjectiveRunnerCheckpoint(new FakeFacts(), publisher, options());

		expect(result).toMatchObject({
			type: "pushed-pr-update-failed",
			error: { code: "pr-edit-failed" },
			nextAuthorization: { lastPublishedHead: TRACKING_SHA },
		});
		expect(authorization().lastPublishedHead).toBe(BASE_SHA);
	});

	test("a later publication sends the complete cumulative summary after a partial update", async () => {
		const firstPublisher = new RecordingPublisher({
			type: "pushed-pr-update-failed",
			headSha: TRACKING_SHA,
			target: expectedTarget(TRACKING_SHA),
			error: { code: "pr-edit-failed", message: "GitHub unavailable" },
		});
		const first = await publishObjectiveRunnerCheckpoint(
			new FakeFacts(),
			firstPublisher,
			options(),
		);
		if (first.type !== "pushed-pr-update-failed") throw new Error("Expected partial publication.");

		const nextSummary: ObjectiveRunnerCumulativeSummaryV1 = {
			...summary(),
			publishedHead: NEXT_HEAD_SHA,
			objectiveTrackingCommits: [
				...summary().objectiveTrackingCommits,
				{ sha: NEXT_HEAD_SHA, subject: "Record later progress" },
			],
			steps: [
				...summary().steps,
				{
					runnerCommitSha: NEXT_RUNNER_SHA,
					validation: [{ command: "just", result: "passed" }],
					decisions: [],
				},
			],
		};
		const nextPublisher = new RecordingPublisher({
			type: "published",
			headSha: NEXT_HEAD_SHA,
			target: expectedTarget(NEXT_HEAD_SHA),
		});
		const next = await publishObjectiveRunnerCheckpoint(
			new FakeFacts({
				target: targetFacts({ localHead: NEXT_HEAD_SHA, remoteHead: TRACKING_SHA }),
				commits: {
					lastPublishedHead: TRACKING_SHA,
					intendedPublishedHead: NEXT_HEAD_SHA,
					isLastPublishedHeadAncestor: true,
					commits: [
						{ sha: NEXT_RUNNER_SHA, objectiveRunnerStepTrailers: [SLUG] },
						{ sha: NEXT_HEAD_SHA, objectiveRunnerStepTrailers: [] },
					],
				},
			}),
			nextPublisher,
			{
				...options(),
				authorization: first.nextAuthorization,
				summary: nextSummary,
				checkpoint: {
					isVerified: true,
					runnerCommitShas: [NEXT_RUNNER_SHA],
					objectiveTrackingCommitShas: [NEXT_HEAD_SHA],
				},
			},
		);

		expect(next).toMatchObject({
			type: "published",
			nextAuthorization: { lastPublishedHead: NEXT_HEAD_SHA },
		});
		expect(nextPublisher.calls[0]?.managedBody).toContain(`1. Runner commit \`${RUNNER_SHA}\``);
		expect(nextPublisher.calls[0]?.managedBody).toContain(
			`2. Runner commit \`${NEXT_RUNNER_SHA}\``,
		);
	});
});

function options() {
	return {
		repoRoot: "/repo",
		invocationId: "autorun-1",
		objectiveSlug: SLUG,
		authorization: authorization(),
		summary: summary(),
		checkpoint: checkpoint(),
	};
}

function authorization(): ObjectiveRunnerPublicationAuthorizationV1 {
	return {
		version: 1,
		invocationId: "autorun-1",
		objectiveSlug: SLUG,
		policyAttested: true,
		launchConfirmed: true,
		target: {
			repository: "nseng-ai/ns",
			pullRequestNumber: 42,
			pullRequestUrl: PR_URL,
			branch: "feature/publication",
			headBranch: "feature/publication",
		},
		launchHead: BASE_SHA,
		lastPublishedHead: BASE_SHA,
	};
}

function summary(): ObjectiveRunnerCumulativeSummaryV1 {
	return {
		version: 1,
		objectiveSlug: SLUG,
		publishedHead: TRACKING_SHA,
		steps: [
			{
				runnerCommitSha: RUNNER_SHA,
				validation: [{ command: "just", result: "passed" }],
				decisions: ["Keep publication parent-only."],
			},
		],
		objectiveTrackingCommits: [{ sha: TRACKING_SHA, subject: "Record progress" }],
	};
}

function checkpoint() {
	return {
		isVerified: true,
		runnerCommitShas: [RUNNER_SHA],
		objectiveTrackingCommitShas: [TRACKING_SHA],
	};
}

function targetFacts(
	override: { localHead?: string; remoteHead?: string } = {},
): PublicationTargetFacts {
	return {
		repository: "nseng-ai/ns",
		branch: "feature/publication",
		isTrunk: false,
		localHead: override.localHead ?? TRACKING_SHA,
		isWorktreeClean: true,
		pullRequest: {
			number: 42,
			url: PR_URL,
			headBranch: "feature/publication",
			headSha: override.remoteHead ?? BASE_SHA,
		},
	};
}

function commitFacts(): PublicationCommitFacts {
	return {
		lastPublishedHead: BASE_SHA,
		intendedPublishedHead: TRACKING_SHA,
		isLastPublishedHeadAncestor: true,
		commits: [
			{ sha: RUNNER_SHA, objectiveRunnerStepTrailers: [SLUG] },
			{ sha: TRACKING_SHA, objectiveRunnerStepTrailers: [] },
		],
	};
}

function expectedTarget(headSha: string) {
	return {
		branch: "feature/publication",
		pullRequest: {
			number: 42,
			url: PR_URL,
			headBranch: "feature/publication",
			headSha,
		},
	};
}

function publishedResult(): ObjectiveRunnerBranchPublisherResult {
	return { type: "published", headSha: TRACKING_SHA, target: expectedTarget(TRACKING_SHA) };
}
