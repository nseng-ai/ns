import { describe, expect, test } from "vitest";

import type { ObjectiveRunnerPublicationCommandContext } from "../../../src/ns/publication-context.ts";
import type { PublicationAuthorizationStore } from "../../../src/publication/authorization-store.ts";
import {
	publicationPublishRequestSchema,
	runPublicationPublish,
} from "../../../src/ns/publication-commands.ts";
import type { ObjectiveRunnerPublicationFactsGateway } from "../../../src/publication/facts-gateway.ts";
import type { ObjectiveRunnerBranchPublisher } from "../../../src/publication/publish.ts";

const BASE_SHA = "1".repeat(40);
const RUNNER_SHA = "2".repeat(40);
const HEAD_SHA = "3".repeat(40);
const SLUG = "objective-runner-external-writes";

class FailingReplaceStore implements PublicationAuthorizationStore {
	async bind() {
		return { ok: true as const, value: undefined };
	}
	async read() {
		return { ok: true as const, value: JSON.stringify(authorization()) };
	}
	async replace() {
		return {
			ok: false as const,
			error: { code: "authorization-replace-failed", message: "disk full" },
		};
	}
}

describe("publication commands", () => {
	test("schema requires bare @file inputs", () => {
		expect(
			publicationPublishRequestSchema.safeParse({
				invocationId: "run-1",
				objectiveSlug: SLUG,
				authorization: "/scratch/auth.json",
				summary: "inline json",
				checkpoint: "@checkpoint.json",
			}).success,
		).toBe(false);
	});

	test("reports pushed-but-authorization-update-failed after a successful push", async () => {
		const result = await runPublicationPublish(context(), {
			invocationId: "run-1",
			objectiveSlug: SLUG,
			authorization: "@/scratch/auth.json",
			summary: "@/scratch/summary.json",
			checkpoint: "@/scratch/checkpoint.json",
		});

		expect(result).toEqual({
			type: "failure",
			errorType: "pushed-but-authorization-update-failed",
			message: "disk full",
			data: {
				type: "pushed-but-authorization-update-failed",
				headSha: HEAD_SHA,
				authorizationPath: "/scratch/auth.json",
				publicationType: "published",
				error: { code: "authorization-replace-failed", message: "disk full" },
			},
		});
	});
});

function context(): ObjectiveRunnerPublicationCommandContext {
	const facts: ObjectiveRunnerPublicationFactsGateway = {
		readPublicationTarget: async () => ({
			type: "found",
			value: {
				repository: "nseng-ai/ns",
				branch: "feature/publication",
				isTrunk: false,
				localHead: HEAD_SHA,
				isWorktreeClean: true,
				pullRequest: {
					number: 42,
					url: "https://github.com/nseng-ai/ns/pull/42",
					headBranch: "feature/publication",
					headSha: BASE_SHA,
				},
			},
		}),
		readPublicationCommits: async () => ({
			ok: true,
			value: {
				lastPublishedHead: BASE_SHA,
				intendedPublishedHead: HEAD_SHA,
				isLastPublishedHeadAncestor: true,
				commits: [
					{ sha: RUNNER_SHA, objectiveRunnerStepTrailers: [SLUG] },
					{ sha: HEAD_SHA, objectiveRunnerStepTrailers: [] },
				],
			},
		}),
	};
	const publisher: ObjectiveRunnerBranchPublisher = {
		publishBoundBranch: async () => ({
			type: "published",
			headSha: HEAD_SHA,
			target: {
				branch: "feature/publication",
				pullRequest: {
					number: 42,
					url: "https://github.com/nseng-ai/ns/pull/42",
					headBranch: "feature/publication",
					headSha: HEAD_SHA,
				},
			},
		}),
	};
	const files: Record<string, string> = {
		"/scratch/summary.json": JSON.stringify(summary()),
		"/scratch/checkpoint.json": JSON.stringify({
			isVerified: true,
			runnerCommitShas: [RUNNER_SHA],
			objectiveTrackingCommitShas: [HEAD_SHA],
		}),
	};
	return {
		cwd: "/repo",
		repoRoot: "/repo",
		trunkBranch: "main",
		commands: {
			exec: async () => ({ type: "exited", code: 0, signal: null, stdout: "", stderr: "" }),
		},
		facts,
		publisher,
		authorizations: new FailingReplaceStore(),
		readTextFile: async (path) => ({ ok: true, content: files[path] ?? "" }),
	};
}

function authorization() {
	return {
		version: 1,
		invocationId: "run-1",
		objectiveSlug: SLUG,
		isPolicyAttested: true,
		isLaunchConfirmed: true,
		target: {
			repository: "nseng-ai/ns",
			pullRequestNumber: 42,
			pullRequestUrl: "https://github.com/nseng-ai/ns/pull/42",
			branch: "feature/publication",
			headBranch: "feature/publication",
		},
		launchHead: BASE_SHA,
		lastPublishedHead: BASE_SHA,
	};
}

function summary() {
	return {
		version: 1,
		objectiveSlug: SLUG,
		publishedHead: HEAD_SHA,
		steps: [
			{
				runnerCommitSha: RUNNER_SHA,
				validation: [{ command: "just", result: "passed" }],
				decisions: [],
			},
		],
		objectiveTrackingCommits: [{ sha: HEAD_SHA, subject: "Track progress" }],
	};
}
