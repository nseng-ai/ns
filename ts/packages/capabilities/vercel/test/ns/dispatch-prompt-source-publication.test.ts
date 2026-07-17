// Scenario tests for `ns dispatch prompt`: source publication and authorization behavior.
import { describe, expect, test } from "vitest";

import {
	FAKE_DEPLOYMENT_URL,
	FAKE_DISPATCH_SETTINGS_SOURCE,
	FAKE_HEAD_SHA,
	FAKE_REWRITTEN_HEAD_SHA,
	FAKE_SEMANTIC_SLUG,
	type FakeDispatchGatewaysOptions,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";
import {
	EXPECTED_ANCHOR_BRANCH,
	PROMPT,
	TRACKED_PLAN,
	runPromptCommand,
} from "./dispatch-prompt-command-support.ts";

describe("ns dispatch prompt source publication", () => {
	test("exact remote skips Flow planning/execution, authorization, and Git publication", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			status: "dispatched",
			isSourcePushed: false,
			sourcePublication: "already-current",
		});
		expect(gateways.sourcePublication.plans).toEqual([]);
		expect(gateways.sourcePublication.publications).toEqual([]);
		expect(gateways.publicationAuthorization.requests).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
	});

	test("tracked TTY decline is a non-mutating cancellation with no anchor or run", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			publicationAuthorization: { isInteractive: true, interactiveResult: "declined" },
		});

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.data).toEqual({
			status: "source-publication-declined",
			affectedBranches: ["feature/widgets", "feature/base"],
			totalAffectedBranches: 2,
		});
		expect(gateways.sourcePublication.publications).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("tracked noninteractive publication requires --force before mutation", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
		});

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") return;
		expect(exit.data).toEqual({
			missingFlag: "--force",
			affectedBranches: ["feature/widgets", "feature/base"],
			totalAffectedBranches: 2,
		});
		expect(gateways.sourcePublication.publications).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("force-required scope data is bounded and reports the total impact", async () => {
		const affectedBranches = Array.from({ length: 60 }, (_, index) => `feature/branch-${index}`);
		const { exit } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: {
				plan: { type: "tracked", plan: { trunkBranch: "main", affectedBranches } },
			},
		});

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") return;
		expect(exit.data).toEqual({
			missingFlag: "--force",
			affectedBranches: affectedBranches.slice(0, 50),
			totalAffectedBranches: 60,
		});
	});

	test.each(["--force", "-f"])(
		"tracked %s authorizes Flow with Flow force false and never plain Git",
		async (flag) => {
			const { exit, gateways } = await runPromptCommand([flag, PROMPT], {
				git: { remoteTip: { type: "missing" } },
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(exit.type).toBe("ok");
			if (exit.type !== "ok") return;
			expect(exit.data).toMatchObject({
				sourcePublication: "graphite-submitted",
				isSourcePushed: true,
			});
			expect(gateways.publicationAuthorization.requests).toEqual([
				{
					affectedBranches: ["feature/widgets", "feature/base"],
					isForceAuthorized: true,
				},
			]);
			expect(gateways.sourcePublication.publications).toEqual([
				{
					expectedBranch: "feature/widgets",
					expectedHeadSha: FAKE_HEAD_SHA,
					expectedPlan: TRACKED_PLAN.plan,
					restack: true,
					force: false,
				},
			]);
			expect(gateways.git.sourcePushes).toEqual([]);
		},
	);

	test("a rewritten Graphite SHA reaches anchor commit/body, PR, run input, and result", async () => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
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

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			revision: FAKE_REWRITTEN_HEAD_SHA,
			sourcePublication: "graphite-submitted",
		});
		expect(gateways.git.anchorPushes).toEqual([
			{ revision: FAKE_REWRITTEN_HEAD_SHA, anchorBranch: EXPECTED_ANCHOR_BRANCH },
		]);
		expect(gateways.anchorPrs.opened[0]?.body).toContain(FAKE_REWRITTEN_HEAD_SHA);
		expect(gateways.anchorPrs.opened[0]?.baseBranch).toBe("feature/widgets");
		expect(gateways.trigger.startCalls[0]?.input.revision).toBe(FAKE_REWRITTEN_HEAD_SHA);
	});

	test("Graphite publication immediately refreshes preflight facts consumed by naming and trigger", async () => {
		const refreshedDeploymentUrl = "https://refreshed-dispatch.example.vercel.app";
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			config: {
				dispatchSettingsAfterPublication: {
					type: "found",
					source: FAKE_DISPATCH_SETTINGS_SOURCE.replace(
						'anchor_timezone = "America/Los_Angeles"',
						'anchor_timezone = "UTC"',
					).replace(
						`deployment_url = "${FAKE_DEPLOYMENT_URL}"`,
						`deployment_url = "${refreshedDeploymentUrl}"`,
					),
				},
			},
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			anchorBranch: `dispatch/${FAKE_SEMANTIC_SLUG}-20260715-141814`,
			sourcePublication: "graphite-submitted",
		});
		expect(gateways.trigger.startCalls[0]?.connection.deploymentUrl).toBe(refreshedDeploymentUrl);
	});

	test.each([
		["provider", "flow-minimal-submit-topology-provider-failure"],
		["topology", "flow-minimal-submit-topology-path-inconsistent"],
	] as const)("%s planning failure fails closed", async (_label, code) => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: {
				plan: {
					type: "failed",
					stage: "planning",
					code,
					message: "Structured Graphite planning failed.",
					mutation: { local: "none", remote: "none" },
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-publication-plan-failed");
		expect(exit.data).toMatchObject({ code, mutation: { local: "none", remote: "none" } });
		expect(gateways.sourcePublication.publications).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test.each([
		["restack", "flow-minimal-submit-restack-conflict", "possible", "none"],
		["submit", "flow-minimal-submit-submit-failed", "none", "possible"],
		["verification", "flow-minimal-submit-verification-no_current_pr", "none", "observed"],
	] as const)(
		"%s failure creates no anchor and reports conservative mutation",
		async (stage, code, local, remote) => {
			const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
				git: { remoteTip: { type: "missing" } },
				sourcePublication: {
					plan: TRACKED_PLAN,
					publish: {
						type: "failed",
						stage,
						code,
						message: "Graphite publication failed.",
						mutation: { local, remote },
					},
				},
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("graphite-publication-failed");
			expect(exit.data).toMatchObject({
				stage,
				code,
				affectedBranches: ["feature/widgets", "feature/base"],
				totalAffectedBranches: 2,
				mutation: { local, remote },
			});
			expect(exit.message).toContain("No dispatch anchor or run was created");
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.anchorPrs.opened).toEqual([]);
			expect(gateways.trigger.startCalls).toEqual([]);
		},
	);

	test("pushes the captured SHA when an untracked remote branch is behind", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "found", sha: "b".repeat(40) } },
		});

		expect(exit.type).toBe("ok");
		expect(gateways.git.sourcePushes).toEqual([
			{ branch: "feature/widgets", expectedRevision: FAKE_HEAD_SHA },
		]);
	});

	test("reports a failed source push without opening anything", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: {
				remoteTip: { type: "missing" },
				sourcePushResult: {
					ok: false,
					error: {
						code: "git-push-failed",
						message: "Pushing branch feature/widgets failed: rejected",
					},
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-push-failed");
		expect(exit.data).toMatchObject({
			mutation: { local: "none", remote: "possible" },
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.message).toContain("no dispatch anchor or run was created");
		expect(gateways.git.sourcePushes).toEqual([
			{ branch: "feature/widgets", expectedRevision: FAKE_HEAD_SHA },
		]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test.each([
		[
			"anchor-push-failed",
			{
				git: {
					anchorPushResult: { ok: false as const, error: { code: "push", message: "push failed" } },
				},
			},
		],
		[
			"anchor-pr-failed",
			{
				anchorPrs: {
					openResult: { ok: false as const, error: { code: "pr", message: "PR failed" } },
				},
			},
		],
		[
			"trigger-failed",
			{
				trigger: {
					startResult: {
						ok: false as const,
						error: { code: "workflow-start-failed", message: "trigger failed" },
					},
				},
			},
		],
		[
			"run-id-stamp-failed",
			{
				anchorPrs: {
					stampResult: { ok: false as const, error: { code: "stamp", message: "stamp failed" } },
				},
			},
		],
	] satisfies ReadonlyArray<readonly [string, FakeDispatchGatewaysOptions]>)(
		"%s preserves completed Graphite publication evidence",
		async (errorType, failure) => {
			const failureGit = "git" in failure ? failure.git : {};
			const { exit } = await runPromptCommand(["--force", PROMPT], {
				...failure,
				git: { remoteTip: { type: "missing" }, ...failureGit },
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe(errorType);
			expect(exit.data).toMatchObject({
				sourcePublication: "graphite-submitted",
				mutation: { local: "none", remote: "observed" },
				affectedBranches: ["feature/widgets", "feature/base"],
				totalAffectedBranches: 2,
			});
			expect(exit.message).toContain("Source publication completed via graphite-submitted");
		},
	);

	test("anchor push failure preserves completed Git publication without Graphite scope", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			git: {
				remoteTip: { type: "missing" },
				anchorPushResult: { ok: false, error: { code: "push", message: "push failed" } },
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("anchor-push-failed");
		expect(exit.data).toMatchObject({
			sourcePublication: "git-pushed",
			mutation: { local: "none", remote: "observed" },
		});
		expect(exit.data).not.toHaveProperty("affectedBranches");
		expect(exit.data).not.toHaveProperty("totalAffectedBranches");
		expect(exit.message).toContain("Source publication completed via git-pushed");
		expect(exit.message).not.toContain("Nothing was dispatched");
	});
});
