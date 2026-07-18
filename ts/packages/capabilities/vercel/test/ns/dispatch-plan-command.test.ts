import { describe, expect, test } from "vitest";

import { dispatchPlanCommand } from "../../src/ns/commands/plan.ts";
import {
	createFakePlanDispatchGateways,
	FakeDispatchNsApi,
	FAKE_DISPATCH_ID,
	FAKE_HEAD_SHA,
	FAKE_OIDC_TOKEN,
	FAKE_PLAN_REF,
	FAKE_RUN_ID,
	FAKE_WORKFLOW_RUN_URL,
	type FakeDispatchGatewaysOptions,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";

async function runPlanCommand(argv: readonly string[], options: FakeDispatchGatewaysOptions = {}) {
	const gateways = createFakePlanDispatchGateways(options);
	const api = new FakeDispatchNsApi(gateways);
	const exit = await dispatchPlanCommand.run(api, {
		argv: [...argv],
		commandPath: ["dispatch", "plan"],
	});
	return { exit, gateways, api };
}

describe("ns dispatch plan", () => {
	test("delivers the Saved Plan and dispatches only its full locator", async () => {
		const { exit, gateways, api } = await runPlanCommand([FAKE_PLAN_REF]);

		if (exit.type !== "ok") {
			throw new Error(JSON.stringify(exit));
		}
		expect(exit.data).toMatchObject({
			status: "dispatched",
			dispatchId: FAKE_DISPATCH_ID,
			revision: FAKE_HEAD_SHA,
			contextLocator: {
				namespace: "dispatch-context",
				dispatchId: FAKE_DISPATCH_ID,
				contextPrefix: `${FAKE_DISPATCH_ID}/`,
				planKey: `${FAKE_DISPATCH_ID}/plan/add-cache.md`,
				sourceBranch: "feature/widgets",
			},
			runId: FAKE_RUN_ID,
			workflowRunUrl: FAKE_WORKFLOW_RUN_URL,
		});
		expect(exit.human).toContain(`Dispatch ID: ${FAKE_DISPATCH_ID}`);
		expect(exit.human).toContain("https://github.com/nseng-ai/ns/pull/41");
		expect(exit.human).not.toContain("snapshotRef");

		expect(gateways.trigger.startCalls).toHaveLength(1);
		const call = gateways.trigger.startCalls[0];
		expect(call?.connection.oidcToken).toBe(FAKE_OIDC_TOKEN);
		expect(call?.input).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			contextLocator: { namespace: "dispatch-context" },
		});
		expect(JSON.stringify(call?.input)).not.toContain("# Add cache");
		expect(api.phaseLabels).toEqual([
			"Checking the source branch and worktree…",
			"Validating dispatch configuration and identity…",
			"Resolving the Saved Plan…",
			"Ensuring the source revision is remotely reachable…",
			"Delivering the Saved Plan through Branch Memory…",
			"Creating the anchor branch and pull request…",
			"Starting the remote workflow…",
			"Recording the workflow run on the anchor PR…",
			"cleared",
		]);
		expect(gateways.operations).toEqual([
			"git:resolve-source-ref",
			"git:list-dirty-paths",
			"config:read-dispatch-settings",
			"config:read-local-dispatch-settings",
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

	test("writes marked full provenance into the plan anchor PR", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF]);

		expect(exit.type).toBe("ok");
		const body = gateways.anchorPrs.opened[0]?.body ?? "";
		expect(body).toContain("<!-- ns:dispatch-provenance:start -->");
		expect(body).toContain(`**Dispatch ID:** \`${FAKE_DISPATCH_ID}\``);
		expect(body).toContain("**Branch Memory namespace:** `dispatch-context`");
		expect(body).toContain("**Snapshot Ref:** `refs/brmem/");
		expect(body).toContain("<!-- ns:dispatch-provenance:end -->");
	});

	test("reports missing Saved Plan input before Branch Memory or cloud effects", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF], {
			plan: { savedPlan: { type: "not-found", message: "Saved Plan does not exist." } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("plan-not-found");
		expect(exit.data).toEqual({ planRef: FAKE_PLAN_REF });
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("refuses missing Branch Memory synchronization with recovery guidance", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF], {
			plan: { brmem: { remotes: {} } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("branch-memory-setup-required");
		expect(exit.message).toContain("brmem setup-git");
		expect(exit.data).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			remote: "origin",
			setupCommand: "brmem setup-git",
			artifacts: [],
		});
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("preserves the retained Branch Memory Entry when snapshot publication fails", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF], {
			plan: {
				snapshotPublishResult: {
					ok: false,
					error: { code: "git-push-failed", message: "Snapshot push was rejected." },
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("snapshot-publication-failed");
		expect(exit.data).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			code: "git-push-failed",
			artifacts: [
				{
					type: "branch-memory-entry",
					namespace: "dispatch-context",
					key: `${FAKE_DISPATCH_ID}/plan/add-cache.md`,
				},
			],
		});
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test("reports an exact remote Snapshot mismatch without starting cloud work", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF], {
			plan: {
				remoteSnapshotResult: { type: "found", commitSha: "2".repeat(40) },
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("remote-snapshot-mismatch");
		expect(exit.data).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			expectedCommitSha: "1111111111111111111111111111111111111111",
			actualCommitSha: "2222222222222222222222222222222222222222",
		});
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test.each([
		{
			label: "anchor push",
			options: {
				git: {
					anchorPushResult: {
						ok: false as const,
						error: { code: "push-failed", message: "Anchor push failed." },
					},
				},
			},
			errorType: "anchor-push-failed",
			hasPr: false,
		},
		{
			label: "anchor PR",
			options: {
				anchorPrs: {
					openResult: {
						ok: false as const,
						error: { code: "pr-failed", message: "Anchor PR failed." },
					},
				},
			},
			errorType: "anchor-pr-failed",
			hasPr: false,
		},
		{
			label: "run-id validation",
			options: { trigger: { runId: "unsafe run id" } },
			errorType: "run-id-stamp-failed",
			hasPr: true,
		},
		{
			label: "run-id stamp",
			options: {
				anchorPrs: {
					stampResult: {
						ok: false as const,
						error: { code: "stamp-failed", message: "Stamp failed." },
					},
				},
			},
			errorType: "run-id-stamp-failed",
			hasPr: true,
		},
	] as const)("reports delivery evidence after $label failure", async (scenario) => {
		const { exit } = await runPlanCommand([FAKE_PLAN_REF], scenario.options);

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe(scenario.errorType);
		expect(exit.message).toContain(`Dispatch ID ${FAKE_DISPATCH_ID}`);
		expect(exit.data).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			artifacts: [{ type: "branch-memory-entry" }, { type: "published-snapshot-ref" }],
		});
		if (scenario.hasPr) expect(exit.data).toMatchObject({ anchorPrNumber: 41 });
		else expect(exit.data).not.toHaveProperty("anchorPrNumber");
	});

	test("keeps plan provenance and the open anchor visible when workflow start fails", async () => {
		const { exit } = await runPlanCommand([FAKE_PLAN_REF], {
			trigger: {
				startResult: {
					ok: false,
					error: { code: "workflow-start-failed", message: "Workflow start failed." },
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("trigger-failed");
		expect(exit.message).toContain(`Dispatch ID ${FAKE_DISPATCH_ID}`);
		expect(exit.data).toMatchObject({
			dispatchId: FAKE_DISPATCH_ID,
			code: "workflow-start-failed",
			anchorBranch: `dispatch/feature-widgets-${FAKE_DISPATCH_ID}`,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
			artifacts: [{ type: "branch-memory-entry" }, { type: "published-snapshot-ref" }],
		});
	});

	test("refuses a dirty tree before Branch Memory or cloud effects", async () => {
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF], {
			git: { dirtyPaths: ["src/widget.ts"] },
		});

		expect(exit.type).toBe("negative");
		expect(gateways.git.sourcePushes).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
		expect(gateways.trigger.startCalls).toEqual([]);
	});

	test.each(["--help", "-h"])(
		"%s documents the explicit Saved Plan and setup prerequisite",
		async (flag) => {
			const { exit } = await runPlanCommand([flag]);

			expect(exit.type).toBe("ok");
			if (exit.type !== "ok") return;
			const help = String(exit.data);
			expect(help).toContain("Usage: ns dispatch plan");
			expect(help).toContain("Saved Plan");
			expect(help).toContain("brmem setup-git");
		},
	);

	test("--json-schema publishes full machine provenance", async () => {
		const { exit } = await runPlanCommand(["--json-schema"]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const schema = JSON.stringify(exit.data);
		expect(schema).toContain("dispatchId");
		expect(schema).toContain("contextLocator");
		expect(schema).toContain("snapshotRef");
		expect(schema).toContain("snapshotCommitSha");
		expect(schema).toContain("workflowRunUrl");
	});

	test("requires an explicit plan reference", async () => {
		const { exit, gateways } = await runPlanCommand([]);

		expect(exit.type).toBe("usageError");
		expect(gateways.trigger.startCalls).toEqual([]);
	});
});
