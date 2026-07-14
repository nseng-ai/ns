import { describe, expect, test } from "vitest";

import {
	bindObjectiveRunnerPublication,
	recheckObjectiveRunnerPublication,
} from "../../../src/publication/authorization.ts";
import type {
	ObjectiveRunnerCumulativeSummaryV1,
	ObjectiveRunnerPublicationAuthorizationV1,
	ObjectiveRunnerPublicationCheckpoint,
	PublicationCommitFacts,
	PublicationTargetFacts,
} from "../../../src/publication/contracts.ts";
import type {
	ObjectiveRunnerPublicationFactsGateway,
	PublicationFactsResult,
	PublicationTargetFactsResult,
} from "../../../src/publication/facts-gateway.ts";

const LAUNCH_SHA = "1".repeat(40);
const RUNNER_SHA = "2".repeat(40);
const TRACKING_SHA = "3".repeat(40);
const SLUG = "objective-runner-external-writes";
const INVOCATION_ID = "autorun-1";

class FakePublicationFactsGateway implements ObjectiveRunnerPublicationFactsGateway {
	readonly reads: string[] = [];
	private readonly target: PublicationTargetFactsResult;
	private readonly commits: PublicationFactsResult<PublicationCommitFacts>;

	constructor(
		options: {
			target?: PublicationTargetFactsResult;
			commits?: PublicationFactsResult<PublicationCommitFacts>;
		} = {},
	) {
		this.target = options.target ?? { type: "found", value: targetFacts() };
		this.commits = options.commits ?? { ok: true, value: commitFacts() };
	}

	async readPublicationTarget(): Promise<PublicationTargetFactsResult> {
		this.reads.push("target");
		return structuredClone(this.target);
	}

	async readPublicationCommits(): Promise<PublicationFactsResult<PublicationCommitFacts>> {
		this.reads.push("commits");
		return structuredClone(this.commits);
	}
}

describe("bindObjectiveRunnerPublication", () => {
	test("binds an exact non-trunk existing-PR launch", async () => {
		const gateway = new FakePublicationFactsGateway({
			target: { type: "found", value: launchTargetFacts() },
		});
		const result = await bindObjectiveRunnerPublication(gateway, {
			repoRoot: "/repo",
			attestation: launchAttestation(),
		});

		expect(result).toEqual({ ok: true, value: authorization() });
		expect(gateway.reads).toEqual(["target"]);
	});

	test("refuses a branch without an existing pull request", async () => {
		const gateway = new FakePublicationFactsGateway({ target: { type: "missing" } });
		const result = await bindObjectiveRunnerPublication(gateway, {
			repoRoot: "/repo",
			attestation: launchAttestation(),
		});

		expect(result).toMatchObject({
			ok: false,
			refusal: { code: "target-unavailable" },
		});
		expect(gateway.reads).toEqual(["target"]);
	});

	test.each([
		["invalid-attestation", { policyAttested: false }],
		["branch-drift", { target: launchTargetFacts({ branch: "other" }) }],
		["pull-request-mismatch", { target: launchTargetFacts({ pullRequestNumber: 99 }) }],
		["local-head-drift", { target: launchTargetFacts({ localHead: RUNNER_SHA }) }],
		["remote-head-drift", { target: launchTargetFacts({ remoteHead: RUNNER_SHA }) }],
		["dirty-worktree", { target: launchTargetFacts({ isWorktreeClean: false }) }],
		["trunk-branch", { target: launchTargetFacts({ isTrunk: true }) }],
	] as const)("refuses %s before commit-fact reads", async (code, override) => {
		const gateway = new FakePublicationFactsGateway(
			"target" in override ? { target: { type: "found", value: override.target } } : {},
		);
		const attestation = {
			...launchAttestation(),
			...(code === "invalid-attestation" ? { policyAttested: false } : {}),
		};
		const result = await bindObjectiveRunnerPublication(gateway, {
			repoRoot: "/repo",
			attestation,
		});

		expect(result).toMatchObject({ ok: false, refusal: { code } });
		expect(gateway.reads).not.toContain("commits");
	});
});

describe("recheckObjectiveRunnerPublication", () => {
	test("accepts matching checkpoint, target, ancestry, and provenance trailers", async () => {
		const gateway = new FakePublicationFactsGateway();
		const result = await recheckObjectiveRunnerPublication(gateway, recheckOptions());

		expect(result).toMatchObject({
			ok: true,
			value: { authorization: { invocationId: INVOCATION_ID }, summary: { objectiveSlug: SLUG } },
		});
		expect(gateway.reads).toEqual(["target", "commits"]);
	});

	test.each([
		["invalid-authorization", { authorization: {} }],
		["invocation-mismatch", { invocationId: "autorun-2" }],
		["invalid-summary", { summary: {} }],
		["objective-mismatch", { objectiveSlug: "other-objective" }],
		["unverified-checkpoint", { checkpoint: checkpoint({ isVerified: false }) }],
		[
			"checkpoint-summary-mismatch",
			{ checkpoint: checkpoint({ runnerCommitShas: [TRACKING_SHA] }) },
		],
	] as const)("refuses %s before commit-fact reads", async (code, override) => {
		const gateway = new FakePublicationFactsGateway();
		const result = await recheckObjectiveRunnerPublication(gateway, {
			...recheckOptions(),
			...override,
		});

		expect(result).toMatchObject({ ok: false, refusal: { code } });
		expect(gateway.reads).not.toContain("commits");
	});

	test.each([
		["non-descendant-history", commitFacts({ isLastPublishedHeadAncestor: false })],
		["commit-range-mismatch", commitFacts({ commits: [runnerCommitFacts()] })],
		[
			"runner-trailer-mismatch",
			commitFacts({
				commits: [runnerCommitFacts(["another-objective"]), trackingCommitFacts()],
			}),
		],
	] as const)("refuses %s from semantic commit facts", async (code, facts) => {
		const gateway = new FakePublicationFactsGateway({ commits: { ok: true, value: facts } });
		const result = await recheckObjectiveRunnerPublication(gateway, recheckOptions());

		expect(result).toMatchObject({ ok: false, refusal: { code } });
		expect(gateway.reads).toEqual(["target", "commits"]);
	});

	test("authorization cannot be reused by another invocation", async () => {
		const gateway = new FakePublicationFactsGateway();
		const result = await recheckObjectiveRunnerPublication(gateway, {
			...recheckOptions(),
			invocationId: "later-autorun",
		});

		expect(result).toMatchObject({ ok: false, refusal: { code: "invocation-mismatch" } });
		expect(gateway.reads).toEqual([]);
	});
});

function launchAttestation() {
	return {
		version: 1 as const,
		invocationId: INVOCATION_ID,
		objectiveSlug: SLUG,
		policyAttested: true as const,
		launchConfirmed: true as const,
		target: {
			repository: "nseng-ai/ns",
			pullRequestNumber: 42,
			pullRequestUrl: "https://github.com/nseng-ai/ns/pull/42",
			branch: "feature/publication",
			headBranch: "feature/publication",
		},
		launchHead: LAUNCH_SHA,
		remoteHead: LAUNCH_SHA,
	};
}

function authorization(): ObjectiveRunnerPublicationAuthorizationV1 {
	const { remoteHead, ...attestation } = launchAttestation();
	return { ...attestation, lastPublishedHead: remoteHead };
}

function launchTargetFacts(
	override: Parameters<typeof targetFacts>[0] = {},
): PublicationTargetFacts {
	return targetFacts({ localHead: LAUNCH_SHA, ...override });
}

function targetFacts(
	override: {
		branch?: string;
		pullRequestNumber?: number;
		pullRequestUrl?: string;
		localHead?: string;
		remoteHead?: string;
		isWorktreeClean?: boolean;
		isTrunk?: boolean;
	} = {},
): PublicationTargetFacts {
	const branch = override.branch ?? "feature/publication";
	return {
		repository: "nseng-ai/ns",
		branch,
		isTrunk: override.isTrunk ?? false,
		localHead: override.localHead ?? TRACKING_SHA,
		isWorktreeClean: override.isWorktreeClean ?? true,
		pullRequest: {
			number: override.pullRequestNumber ?? 42,
			url: override.pullRequestUrl ?? "https://github.com/nseng-ai/ns/pull/42",
			headBranch: branch,
			headSha: override.remoteHead ?? LAUNCH_SHA,
		},
	};
}

function summary(
	override: Partial<ObjectiveRunnerCumulativeSummaryV1> = {},
): ObjectiveRunnerCumulativeSummaryV1 {
	return {
		version: 1,
		objectiveSlug: SLUG,
		publishedHead: TRACKING_SHA,
		steps: [
			{
				runnerCommitSha: RUNNER_SHA,
				validation: [{ command: "just", result: "passed" }],
				decisions: [],
			},
		],
		objectiveTrackingCommits: [{ sha: TRACKING_SHA, subject: "Record progress" }],
		...override,
	};
}

function checkpoint(
	override: Partial<ObjectiveRunnerPublicationCheckpoint> = {},
): ObjectiveRunnerPublicationCheckpoint {
	return {
		isVerified: true,
		runnerCommitShas: [RUNNER_SHA],
		objectiveTrackingCommitShas: [TRACKING_SHA],
		...override,
	};
}

function commitFacts(override: Partial<PublicationCommitFacts> = {}): PublicationCommitFacts {
	return {
		lastPublishedHead: LAUNCH_SHA,
		intendedPublishedHead: TRACKING_SHA,
		isLastPublishedHeadAncestor: true,
		commits: [runnerCommitFacts(), trackingCommitFacts()],
		...override,
	};
}

function runnerCommitFacts(trailers: string[] = [SLUG]) {
	return { sha: RUNNER_SHA, objectiveRunnerStepTrailers: trailers };
}

function trackingCommitFacts() {
	return { sha: TRACKING_SHA, objectiveRunnerStepTrailers: [] };
}

function recheckOptions() {
	return {
		repoRoot: "/repo",
		invocationId: INVOCATION_ID,
		objectiveSlug: SLUG,
		authorization: authorization(),
		summary: summary(),
		checkpoint: checkpoint(),
	};
}
