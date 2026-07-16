import { describe, expect, test } from "vitest";

import { executeDispatchPrompt } from "../../src/dispatch-client/prompt-core.ts";
import {
	createFakeDispatchGateways,
	FAKE_HEAD_SHA,
	FAKE_REWRITTEN_HEAD_SHA,
	FAKE_RUN_ID,
	type FakeDispatchGatewaysOptions,
} from "./support/dispatch-prompt-fakes.ts";

const REQUEST = {
	cwd: "/repo",
	prompt: "Rename widget gateways",
	force: true,
};
const TRACKED_PLAN = {
	type: "tracked" as const,
	plan: { trunkBranch: "main", affectedBranches: ["feature/widgets", "feature/base"] },
};

async function execute(options: FakeDispatchGatewaysOptions = {}) {
	const gateways = createFakeDispatchGateways(options);
	const outcome = await executeDispatchPrompt(REQUEST, gateways);
	return { outcome, gateways };
}

describe("executeDispatchPrompt lifecycle", () => {
	test("uses the rewritten Graphite source for anchor, PR, trigger, and result", async () => {
		const { outcome, gateways } = await execute({
			git: { remoteTip: { type: "missing" } },
			sourcePublication: {
				plan: TRACKED_PLAN,
				publish: {
					type: "published",
					source: { branch: "feature/widgets", headSha: FAKE_REWRITTEN_HEAD_SHA },
					mutation: { local: "observed", remote: "observed" },
				},
			},
		});

		expect(outcome).toMatchObject({
			status: "dispatched",
			revision: FAKE_REWRITTEN_HEAD_SHA,
			receipt: {
				stage: "run-started",
				source: { type: "graphite-submitted" },
				runId: FAKE_RUN_ID,
			},
		});
		expect(gateways.git.anchorPushes[0]?.revision).toBe(FAKE_REWRITTEN_HEAD_SHA);
		expect(gateways.anchorPrs.opened[0]?.body).toContain(FAKE_REWRITTEN_HEAD_SHA);
		expect(gateways.trigger.startCalls[0]?.input.revision).toBe(FAKE_REWRITTEN_HEAD_SHA);
	});

	test.each([
		[
			"anchor-push-failed",
			{
				git: {
					anchorPushResult: { ok: false as const, error: { code: "push", message: "failed" } },
				},
			},
			"source",
		],
		[
			"anchor-pr-failed",
			{
				anchorPrs: { openResult: { ok: false as const, error: { code: "pr", message: "failed" } } },
			},
			"anchor-pushed",
		],
		[
			"trigger-failed",
			{
				trigger: {
					startResult: {
						ok: false as const,
						error: { code: "workflow-start-failed" as const, message: "failed" },
					},
				},
			},
			"pr-opened",
		],
		[
			"run-id-stamp-failed",
			{
				anchorPrs: {
					stampResult: { ok: false as const, error: { code: "stamp", message: "failed" } },
				},
			},
			"run-started",
		],
	] satisfies ReadonlyArray<readonly [string, FakeDispatchGatewaysOptions, string]>)(
		"%s retains completed publication and monotonic receipt stage %s",
		async (status, failure, stage) => {
			const failureGit = "git" in failure ? failure.git : {};
			const { outcome } = await execute({
				...failure,
				git: { remoteTip: { type: "missing" }, ...failureGit },
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(outcome).toMatchObject({
				status,
				receipt: {
					stage,
					source: {
						type: "graphite-submitted",
						mutation: { local: "none", remote: "observed" },
						affectedBranches: TRACKED_PLAN.plan.affectedBranches,
					},
				},
			});
		},
	);

	test("successful exact-SHA Git path progresses all artifacts", async () => {
		const { outcome, gateways } = await execute({ git: { remoteTip: { type: "missing" } } });

		expect(outcome).toMatchObject({
			status: "dispatched",
			revision: FAKE_HEAD_SHA,
			receipt: {
				stage: "run-started",
				source: { type: "git-pushed", mutation: { local: "none", remote: "observed" } },
				anchorPr: { branch: expect.stringMatching(/^dispatch\//), number: 41 },
				runId: FAKE_RUN_ID,
			},
		});
		expect(gateways.anchorPrs.stamps).toEqual([{ prNumber: 41, runId: FAKE_RUN_ID }]);
	});
});
