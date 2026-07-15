// Scenario tests for `ns dispatch prompt`: the command runs through its
// own SDK argv adapter against in-memory gateway fakes published on
// `ctx.extensions.dispatch`, covering operations, help, and the
// json-schema machine contract.
import { describe, expect, test } from "vitest";

import { dispatchPromptCommand } from "../../src/ns/commands/prompt.ts";
import { buildDispatchAnchorNameCandidates } from "../../src/dispatch-client/anchor-name.ts";
import {
	createFakeDispatchGateways,
	FakeDispatchNsApi,
	FAKE_ANCHOR_TIMESTAMP,
	FAKE_DEPLOYMENT_URL,
	FAKE_DISPATCH_SETTINGS_SOURCE,
	FAKE_HEAD_SHA,
	FAKE_OIDC_TOKEN,
	FAKE_RUN_ID,
	FAKE_SEMANTIC_SLUG,
	FAKE_WORKFLOW_RUN_URL,
	type FakeDispatchGatewaysOptions,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";

const PROMPT = "Rename the widget gateway methods to match the command-shape convention";
const EXPECTED_ANCHOR_BRANCH = `dispatch/${FAKE_SEMANTIC_SLUG}-${FAKE_ANCHOR_TIMESTAMP}`;

async function runPromptCommand(
	argv: readonly string[],
	options: FakeDispatchGatewaysOptions = {},
) {
	const gateways = createFakeDispatchGateways(options);
	const api = new FakeDispatchNsApi(gateways);
	const exit = await dispatchPromptCommand.run(api, {
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
			"Deriving the semantic anchor branch name…",
			"Ensuring the source revision is remotely reachable…",
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

		// Push-first: the source branch, then the anchor ref at the exact SHA.
		expect(gateways.git.sourcePushes).toEqual(["feature/widgets"]);
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
			"slug:derive-semantic",
			"git:check-anchor-availability",
			"git:read-remote-tip",
			"git:push-source",
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
		expect(gateways.git.remoteTipReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("fails semantic generation before remote-tip reads or mutation", async () => {
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
		expect(gateways.git.remoteTipReads).toEqual([]);
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

	test("reports anchor availability read failure before source reachability or mutation", async () => {
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
		expect(gateways.git.remoteTipReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
	});

	test("reports bounded candidate exhaustion before source reachability or mutation", async () => {
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
		expect(gateways.git.remoteTipReads).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
	});

	test("skips the source push when the remote already has the exact head", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({ status: "dispatched", isSourcePushed: false });
		expect(gateways.git.sourcePushes).toEqual([]);
	});

	test("pushes when the remote branch is behind the local head", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			git: { remoteTip: { type: "found", sha: "b".repeat(40) } },
		});

		expect(exit.type).toBe("ok");
		expect(gateways.git.sourcePushes).toEqual(["feature/widgets"]);
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
		expect(gateways.git.sourcePushes).toEqual(["feature/widgets"]);
		expect(gateways.anchorPrs.opened).toEqual([]);
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
		expect(schemaText).toContain("slug");
		const retiredKey = ["source", "Pushed"].join("");
		expect(schemaText).not.toContain(`"${retiredKey}"`);
	});
});
