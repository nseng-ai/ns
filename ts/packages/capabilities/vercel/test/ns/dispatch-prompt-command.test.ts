// Scenario tests for `ns dispatch prompt`: the command runs through its
// own SDK argv adapter against a dependency-injected complete fake context,
// covering operations, help, and the JSON-schema machine contract.
import { describe, expect, test } from "vitest";

import { createDispatchPromptCommand } from "../../src/ns/commands/prompt.ts";
import { buildDispatchAnchorNameCandidates } from "../../src/dispatch-client/anchor-name.ts";
import {
	createFakeDispatchGateways,
	FakeDispatchNsApi,
	FAKE_ANCHOR_TIMESTAMP,
	FAKE_DEPLOYMENT_URL,
	FAKE_DISPATCH_SETTINGS_SOURCE,
	FAKE_HEAD_SHA,
	FAKE_OIDC_TOKEN,
	FAKE_REWRITTEN_HEAD_SHA,
	FAKE_RUN_ID,
	FAKE_SEMANTIC_SLUG,
	FAKE_WORKFLOW_RUN_URL,
	type FakeDispatchGatewaysOptions,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";

const PROMPT = "Rename the widget gateway methods to match the command-shape convention";
const EXPECTED_ANCHOR_BRANCH = `dispatch/${FAKE_SEMANTIC_SLUG}-${FAKE_ANCHOR_TIMESTAMP}`;
const TRACKED_PLAN = {
	type: "tracked" as const,
	plan: { trunkBranch: "main", affectedBranches: ["feature/widgets", "feature/base"] },
};

async function runPromptCommand(
	argv: readonly string[],
	options: FakeDispatchGatewaysOptions = {},
) {
	const gateways = createFakeDispatchGateways(options);
	const api = new FakeDispatchNsApi();
	const command = createDispatchPromptCommand(() => ({
		cwd: api.cwd,
		gateways,
		commandIo: api.commandIo,
	}));
	const exit = await command.run(api, {
		argv: [...argv],
		commandPath: ["dispatch", "prompt"],
	});
	return { exit, gateways, api };
}

describe("ns dispatch prompt", () => {
	test("dispatches: pushes the stale source branch, anchors, opens the PR, triggers, stamps", async () => {
		const { exit, gateways, api } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "missing" } },
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toEqual({
			status: "dispatched",
			revision: FAKE_HEAD_SHA,
			sourceBranch: "feature/widgets",
			isSourcePushed: true,
			sourcePublication: "git-pushed",
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
			runId: FAKE_RUN_ID,
			workflowRunUrl: FAKE_WORKFLOW_RUN_URL,
		});
		expect(exit.human).toContain(`Workflow run:  ${FAKE_WORKFLOW_RUN_URL}`);
		expect(exit.human).toContain(`Run ID:        ${FAKE_RUN_ID}`);
		expect(api.phaseLabels).toEqual([
			"Checking the source branch and worktree…",
			"Validating dispatch configuration and identity…",
			"Checking whether the source revision is already published…",
			"Deriving the semantic anchor branch name…",
			"Planning source publication…",
			"Pushing the exact source revision with Git…",
			"Revalidating the source and dispatch identity…",
			"Creating the anchor branch and pull request…",
			"Starting the remote workflow…",
			"Recording the workflow run on the anchor PR…",
			"cleared",
		]);
		expect(gateways.semanticSlugs.calls).toEqual([
			{ kind: "prompt", content: PROMPT, cwd: "/repo" },
		]);
		expect(gateways.clock.reads).toEqual([Date.UTC(2026, 6, 15, 14, 18, 14)]);
		expect(gateways.git.anchorAvailabilityReads).toEqual([
			{ cwd: "/repo", anchorBranch: EXPECTED_ANCHOR_BRANCH },
		]);

		// Exact-SHA source publication precedes the anchor ref.
		expect(gateways.git.sourcePushes).toEqual([
			{ branch: "feature/widgets", expectedRevision: FAKE_HEAD_SHA },
		]);
		expect(gateways.git.anchorPushes).toEqual([
			{ revision: FAKE_HEAD_SHA, anchorBranch: EXPECTED_ANCHOR_BRANCH },
		]);

		// The anchor PR opened up front, based on the source branch.
		expect(gateways.anchorPrs.opened).toHaveLength(1);
		const opened = gateways.anchorPrs.opened[0];
		expect(opened?.anchorBranch).toBe(EXPECTED_ANCHOR_BRANCH);
		expect(opened?.baseBranch).toBe("feature/widgets");
		expect(opened?.title).toContain("[dispatch]");
		expect(opened?.body).toContain(FAKE_HEAD_SHA);

		// The trigger call carried the exact run-input contract.
		expect(gateways.trigger.startCalls).toEqual([
			{
				connection: {
					deploymentUrl: FAKE_DEPLOYMENT_URL,
					oidcToken: FAKE_OIDC_TOKEN,
				},
				input: {
					revision: FAKE_HEAD_SHA,
					anchorBranch: EXPECTED_ANCHOR_BRANCH,
					anchorPrNumber: 41,
					prompt: PROMPT,
				},
			},
		]);

		// The workflow run id was stamped on the anchor PR after the trigger.
		expect(gateways.anchorPrs.stamps).toEqual([{ prNumber: 41, runId: FAKE_RUN_ID }]);
		expect(gateways.operations).toEqual([
			"git:resolve-source-ref",
			"git:list-dirty-paths",
			"config:read-dispatch-settings",
			"config:read-package-manager",
			"token:read-development-oidc",
			"trigger:check-identity",
			"git:read-remote-tip",
			"slug:derive-semantic",
			"publication:plan",
			"git:push-source",
			"git:check-anchor-availability",
			"git:resolve-source-ref",
			"git:list-dirty-paths",
			"config:read-dispatch-settings",
			"config:read-package-manager",
			"token:read-development-oidc",
			"trigger:check-identity",
			"git:read-remote-tip",
			"git:push-anchor",
			"anchor-pr:open",
			"trigger:start-run",
			"anchor-pr:stamp-run-id",
		]);
	});

	test.each(["--slug", "-s"])(
		"%s overrides the semantic slug and bypasses generation",
		async (flag) => {
			const { exit, gateways } = await runPromptCommand([flag, "Add Custom Widget!!!", PROMPT]);

			expect(exit.type).toBe("ok");
			if (exit.type !== "ok") return;
			expect(exit.data).toMatchObject({
				anchorBranch: "dispatch/add-custom-widget-20260715-071814",
			});
			expect(gateways.semanticSlugs.calls).toEqual([]);
		},
	);

	test("defaults an omitted repository timezone to America/Los_Angeles", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			config: {
				dispatchSettings: {
					type: "found",
					source: FAKE_DISPATCH_SETTINGS_SOURCE.replace(
						'anchor_timezone = "America/Los_Angeles"\n',
						"",
					),
				},
			},
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({ anchorBranch: EXPECTED_ANCHOR_BRANCH });
	});

	test("uses the configured repository timezone for the anchor timestamp", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			config: {
				dispatchSettings: {
					type: "found",
					source: FAKE_DISPATCH_SETTINGS_SOURCE.replace(
						'anchor_timezone = "America/Los_Angeles"',
						'anchor_timezone = "UTC"',
					),
				},
			},
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			anchorBranch: `dispatch/${FAKE_SEMANTIC_SLUG}-20260715-141814`,
		});
	});

	test("selects -2 when the exact timestamped anchor already exists", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { occupiedAnchorBranches: [EXPECTED_ANCHOR_BRANCH] },
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({ anchorBranch: `${EXPECTED_ANCHOR_BRANCH}-2` });
		expect(gateways.git.anchorAvailabilityReads.map((read) => read.anchorBranch)).toEqual([
			EXPECTED_ANCHOR_BRANCH,
			`${EXPECTED_ANCHOR_BRANCH}-2`,
		]);
	});

	test("rejects an unusable slug override after preflight and before mutation", async () => {
		const { exit, gateways } = await runPromptCommand(["--slug", "///", PROMPT]);

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") return;
		expect(exit.data).toEqual({ argument: "slug" });
		expect(gateways.semanticSlugs.calls).toEqual([]);
		expect(gateways.git.anchorAvailabilityReads).toEqual([]);
		expect(gateways.git.remoteTipReads).toEqual([{ cwd: "/repo", branch: "feature/widgets" }]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("fails semantic generation after the read-only remote check and before mutation", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			semanticSlug: {
				ok: false,
				error: { message: "Semantic generation unavailable; pass --slug/-s." },
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("branch-slug-generation-failed");
		expect(exit.data).toMatchObject({ recovery: expect.stringContaining("--slug/-s") });
		expect(gateways.git.anchorAvailabilityReads).toEqual([]);
		expect(gateways.git.remoteTipReads).toEqual([{ cwd: "/repo", branch: "feature/widgets" }]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("fails invalid timezone config before slug generation or mutation", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: {
				dispatchSettings: {
					type: "found",
					source: FAKE_DISPATCH_SETTINGS_SOURCE.replace(
						'anchor_timezone = "America/Los_Angeles"',
						'anchor_timezone = "Not/A_Real_Zone"',
					),
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(gateways.semanticSlugs.calls).toEqual([]);
		expect(gateways.git.anchorAvailabilityReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
	});

	test("reports anchor availability read failure after the remote check but before mutation", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: {
				anchorAvailabilityError: {
					type: "error",
					error: { code: "git-ls-remote-failed", message: "Could not inspect origin." },
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("anchor-branch-availability-failed");
		expect(exit.data).toEqual({ anchorBranch: EXPECTED_ANCHOR_BRANCH });
		expect(gateways.git.remoteTipReads).toEqual([{ cwd: "/repo", branch: "feature/widgets" }]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
	});

	test("reports bounded candidate exhaustion after the remote check but before mutation", async () => {
		const occupiedAnchorBranches = buildDispatchAnchorNameCandidates(
			FAKE_SEMANTIC_SLUG,
			FAKE_ANCHOR_TIMESTAMP,
		).map((candidate) => candidate.name);
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { occupiedAnchorBranches },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("anchor-branch-unavailable");
		expect(exit.data).toEqual({ semanticSlug: FAKE_SEMANTIC_SLUG, candidateLimit: 50 });
		expect(gateways.git.anchorAvailabilityReads).toHaveLength(50);
		expect(gateways.git.remoteTipReads).toEqual([{ cwd: "/repo", branch: "feature/widgets" }]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
	});

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

	test("Graphite publication uses refreshed preflight facts after anchor probing", async () => {
		const { exit } = await runPromptCommand(["--force", PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			config: {
				dispatchSettingsAfterPublication: {
					type: "found",
					source: FAKE_DISPATCH_SETTINGS_SOURCE.replace(
						'anchor_timezone = "America/Los_Angeles"',
						'anchor_timezone = "UTC"',
					),
				},
			},
		});

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			sourcePublication: "graphite-submitted",
		});
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

	test.each([
		["source read", { isNotARepository: true }, "source-read-failed"],
		["repository drift", { repoRoot: "/other" }, "repository-drift"],
		["branch drift", { branch: "feature/other" }, "branch-drift"],
		["head mismatch", { headSha: "d".repeat(40) }, "head-drift"],
		["dirty worktree", { dirtyPaths: ["conflicted.ts"] }, "dirty-tree"],
		[
			"remote mismatch",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"post-Graphite %s acknowledges prior publication and creates no anchor",
		async (_label, afterGraphitePublication, reason) => {
			const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
				git: {
					remoteTip: { type: "missing" },
					afterGraphitePublication,
				},
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-publication-verification-failed");
			expect(exit.data).toMatchObject({
				sourcePublication: "graphite-submitted",
				reason,
				affectedBranches: ["feature/widgets", "feature/base"],
				totalAffectedBranches: 2,
				mutation: { local: "none", remote: "observed" },
				anchorCreated: false,
				runStarted: false,
			});
			expect(exit.message).toContain("no dispatch anchor or run was created");
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.anchorPrs.opened).toEqual([]);
			expect(gateways.trigger.startCalls).toEqual([]);
		},
	);

	test("post-publication anchor availability failure acknowledges mutation and no anchor/run", async () => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: {
				remoteTip: { type: "missing" },
				anchorAvailabilityError: {
					type: "error",
					error: { code: "git-ls-remote-failed", message: "Could not inspect origin." },
				},
			},
			sourcePublication: { plan: TRACKED_PLAN },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("anchor-branch-availability-failed");
		expect(exit.data).toMatchObject({
			sourcePublication: "graphite-submitted",
			affectedBranches: ["feature/widgets", "feature/base"],
			totalAffectedBranches: 2,
			mutation: { local: "none", remote: "observed" },
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.message).toContain("no dispatch anchor or run was created");
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("second preflight failure acknowledges Graphite publication and creates no anchor", async () => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			config: { dispatchSettingsAfterPublication: { type: "missing" } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-publication-verification-failed");
		expect(exit.data).toMatchObject({
			reason: "preflight-failed",
			mutation: { local: "none", remote: "observed" },
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.data).toHaveProperty("checks");
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test.each([
		["concurrent HEAD drift", { headSha: "d".repeat(40) }, "head-drift"],
		[
			"remote mismatch",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"plain Git %s creates no anchor after the exact-SHA push",
		async (_label, afterGitPush, reason) => {
			const { exit, gateways } = await runPromptCommand([PROMPT], {
				git: {
					remoteTip: { type: "missing" },
					afterGitPush,
				},
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-publication-verification-failed");
			expect(exit.data).toMatchObject({
				sourcePublication: "git-pushed",
				reason,
				mutation: { local: "none", remote: "possible" },
				anchorCreated: false,
				runStarted: false,
			});
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.anchorPrs.opened).toEqual([]);
		},
	);

	test.each([
		["HEAD drift", { headSha: "d".repeat(40) }, "head-drift"],
		["dirty-tree drift", { dirtyPaths: ["late-change.ts"] }, "dirty-tree"],
		[
			"remote-tip drift",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"already-current %s fails the final gate without publication evidence",
		async (_label, beforeFinalValidation, reason) => {
			const { exit, gateways } = await runPromptCommand([PROMPT], {
				git: { beforeFinalValidation },
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-revalidation-failed");
			expect(exit.data).toMatchObject({ reason, anchorCreated: false, runStarted: false });
			expect(exit.data).not.toHaveProperty("sourcePublication");
			expect(exit.data).not.toHaveProperty("mutation");
			expect(gateways.git.anchorPushes).toEqual([]);
			const availabilityIndex = gateways.operations.indexOf("git:check-anchor-availability");
			const finalReadIndex = gateways.operations.lastIndexOf("git:resolve-source-ref");
			expect(availabilityIndex).toBeLessThan(finalReadIndex);
		},
	);

	test("already-current final preflight failure is non-mutating", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: { dispatchSettingsBeforeFinalValidation: { type: "missing" } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-revalidation-failed");
		expect(exit.data).toMatchObject({
			reason: "preflight-failed",
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.data).toHaveProperty("checks");
		expect(gateways.git.anchorPushes).toEqual([]);
	});

	test("refuses a dirty worktree, listing the dirty files, before any mutation", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { dirtyPaths: ["src/widget.ts", "README.md"] },
		});

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.message).toContain("uncommitted changes");
		expect(exit.message).toContain("src/widget.ts");
		expect(exit.message).toContain("README.md");
		expect(exit.data).toEqual({
			status: "dirty-tree",
			dirtyPaths: ["src/widget.ts", "README.md"],
			totalDirtyPaths: 2,
		});
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("preserves the ordinary ASCII refusal text and accounts for both output bounds", async () => {
		const dirtyPaths = Array.from({ length: 101 }, (_unused, index) => `path-${index}.ts`);
		const { exit } = await runPromptCommand([PROMPT], { git: { dirtyPaths } });

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.message).toBe(
			[
				"Dispatch refused: the worktree has uncommitted changes, so what runs remotely would not match what you see.",
				"",
				...dirtyPaths.slice(0, 20).map((path) => `  ${path}`),
				"  … and 81 more",
				"",
				"Commit (or stash) the changes and dispatch again.",
			].join("\n"),
		);
		expect(exit.data).toEqual({
			status: "dirty-tree",
			dirtyPaths: dirtyPaths.slice(0, 100),
			totalDirtyPaths: 101,
		});
	});

	test("refuses a detached HEAD with an actionable failure", async () => {
		const { exit } = await runPromptCommand([PROMPT], { git: { isDetachedHead: true } });

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("detached-head");
	});

	test("fails preflight before any mutation when deployment_url is missing", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: {
				dispatchSettings: {
					type: "found",
					source: [
						"[dispatch]",
						'harness = "pi"',
						'vercel_project_id = "prj_F1"',
						'vercel_team_id = "team_F1"',
					].join("\n"),
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(exit.message).toContain("deployment_url");
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.operations.every((operation) => !operation.includes("push"))).toBe(true);
	});

	test("rejects local claude-code config before remote-tip reads or mutations", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: {
				dispatchSettings: {
					type: "found",
					source: [
						"[dispatch]",
						'harness = "claude-code"',
						'vercel_project_id = "prj_F1"',
						'vercel_team_id = "team_F1"',
						`deployment_url = "${FAKE_DEPLOYMENT_URL}"`,
					].join("\n"),
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(gateways.git.remoteTipReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.identityCalls).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("rejects an invalid packageManager before remote-tip reads or mutations", async () => {
		const invalidValue = "pnpm@latest;do-not-expose";
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: {
				packageManager: {
					type: "found",
					source: JSON.stringify({ packageManager: invalidValue }),
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(exit.message).toContain("ts/package.json#packageManager");
		expect(exit.message).not.toContain(invalidValue);
		expect(gateways.git.remoteTipReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.identityCalls).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("fails preflight when the Development OIDC token is absent, naming it without a value", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			token: { type: "missing", detail: "VERCEL_OIDC_TOKEN is not available." },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(exit.message).toContain("VERCEL_OIDC_TOKEN");
		expect(exit.message).not.toContain(FAKE_OIDC_TOKEN);
	});

	test("fails preflight when the deployment rejects the caller's identity", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			trigger: { identity: { type: "unauthorized" } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(exit.message).toContain("vercel env pull");
		expect(gateways.trigger.startCalls).toEqual([]);
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

	test("keeps the open anchor PR visible when the trigger call fails", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			trigger: {
				startResult: {
					ok: false,
					error: {
						code: "workflow-start-failed",
						message:
							"The trigger route refused the dispatch (workflow-start-failed: Workflow start failed.).",
					},
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("trigger-failed");
		expect(exit.message).toContain("https://github.com/nseng-ai/ns/pull/41");
		expect(exit.data).toEqual({
			code: "workflow-start-failed",
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
		});
		expect(gateways.anchorPrs.stamps).toEqual([]);
	});

	test("reports the started run id when only the stamp fails", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			anchorPrs: {
				stampResult: {
					ok: false,
					error: {
						code: "gh-pr-edit-failed",
						message: "Stamping the run id on the anchor PR failed: boom",
					},
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("run-id-stamp-failed");
		expect(exit.message).toContain(FAKE_RUN_ID);
		expect(exit.data).toEqual({
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
			runId: FAKE_RUN_ID,
		});
		expect(gateways.anchorPrs.stamps).toEqual([{ prNumber: 41, runId: FAKE_RUN_ID }]);
	});

	test("omits an unusable returned run id from stamp-failure data", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			trigger: { startResult: { ok: true, value: { runId: "unsafe run id" } } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("run-id-stamp-failed");
		expect(exit.data).toEqual({
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
		});
		expect(gateways.anchorPrs.stamps).toEqual([]);
	});

	test("rejects a blank prompt as a usage error", async () => {
		const { exit, gateways } = await runPromptCommand(["   "]);

		expect(exit.type).toBe("usageError");
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("rejects a missing prompt argument as a usage error", async () => {
		const { exit } = await runPromptCommand([]);

		expect(exit.type).toBe("usageError");
	});

	test.each(["--help", "-h"])("%s renders usage for the command", async (flag) => {
		const { exit } = await runPromptCommand([flag]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const help = String(exit.data);
		expect(help).toContain("Usage: ns dispatch prompt");
		expect(help).toContain("clean worktree");
		expect(help).toContain("--slug");
		expect(help).toContain("-s");
		expect(help).toContain("--force");
		expect(help).toContain("-f");
		expect(help).toContain("never bypasses Graphite safeguards");
	});

	test("--json-schema publishes the machine envelope contract", async () => {
		const { exit } = await runPromptCommand(["--json-schema"]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const schemaText = JSON.stringify(exit.data);
		expect(schemaText).toContain("dispatched");
		expect(schemaText).toContain("dirty-tree");
		expect(schemaText).toContain("anchorBranch");
		expect(schemaText).toContain("anchorPrNumber");
		expect(schemaText).toContain("anchorPrUrl");
		expect(schemaText).toContain("workflowRunUrl");
		expect(schemaText).toContain("isSourcePushed");
		expect(schemaText).toContain("sourcePublication");
		expect(schemaText).toContain("already-current");
		expect(schemaText).toContain("git-pushed");
		expect(schemaText).toContain("graphite-submitted");
		expect(schemaText).toContain("source-publication-declined");
		expect(schemaText).toContain("--force/-f");
		expect(schemaText).toContain("never forwarded as Graphite force");
		expect(schemaText).toContain("slug");
		const retiredKey = ["source", "Pushed"].join("");
		expect(schemaText).not.toContain(`"${retiredKey}"`);
	});
});
