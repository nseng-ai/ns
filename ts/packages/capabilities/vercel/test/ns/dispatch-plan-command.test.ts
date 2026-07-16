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
} from "./support/dispatch-prompt-fakes.ts";

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
		const { exit, gateways } = await runPlanCommand([FAKE_PLAN_REF]);

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

	test("--help documents the explicit Saved Plan and setup prerequisite", async () => {
		const { exit } = await runPlanCommand(["--help"]);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const help = String(exit.data);
		expect(help).toContain("Usage: ns dispatch plan");
		expect(help).toContain("Saved Plan");
		expect(help).toContain("brmem setup-git");
	});

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
