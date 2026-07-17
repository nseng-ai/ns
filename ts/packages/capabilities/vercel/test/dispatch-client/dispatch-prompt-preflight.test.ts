import { describe, expect, test } from "vitest";

import { runDispatchPreflight } from "../../src/dispatch-client/preflight.ts";
import {
	createFakeDispatchGateways,
	FAKE_DEPLOYMENT_URL,
	FAKE_OIDC_TOKEN,
	FAKE_WORKFLOW_DASHBOARD_URL,
} from "./support/dispatch-prompt-fakes.ts";

function checkById(
	result: Awaited<ReturnType<typeof runDispatchPreflight>>,
	id: "dispatch-config" | "package-manager" | "development-oidc-token" | "trigger-identity",
) {
	const check = result.checks.find((entry) => entry.id === id);
	if (check === undefined) throw new Error(`Missing preflight check ${id}.`);
	return check;
}

describe("runDispatchPreflight", () => {
	test("passes with valid config, a named token, and an authorized identity", async () => {
		const gateways = createFakeDispatchGateways();
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(true);
		expect(result.checks.map((check) => check.status)).toEqual(["ok", "ok", "ok", "ok"]);
		expect(gateways.config.reads).toEqual([
			{ source: "dispatch-settings", repoRoot: "/repo" },
			{ source: "package-manager", repoRoot: "/repo" },
		]);
		if (result.ok) {
			expect(result.deploymentUrl).toBe(FAKE_DEPLOYMENT_URL);
			expect(result.workflowDashboardUrl).toBe(FAKE_WORKFLOW_DASHBOARD_URL);
			expect(result.anchorTimeZone).toBe("America/Los_Angeles");
			expect(result.triggerConnection).toEqual({
				deploymentUrl: FAKE_DEPLOYMENT_URL,
				oidcToken: FAKE_OIDC_TOKEN,
			});
		}
		// The identity preflight carried the token to the configured deployment.
		expect(gateways.trigger.identityCalls).toEqual([
			{ deploymentUrl: FAKE_DEPLOYMENT_URL, oidcToken: FAKE_OIDC_TOKEN },
		]);
	});

	test("reports a missing ns.toml as an actionable config failure", async () => {
		const gateways = createFakeDispatchGateways({
			config: { dispatchSettings: { type: "missing" } },
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const config = checkById(result, "dispatch-config");
		expect(config.status).toBe("failed");
		expect(config.detail).toContain("ns.toml");
		expect(config.detail).toContain("[dispatch]");
	});

	test("names the missing deployment_url key without failing the whole table", async () => {
		const gateways = createFakeDispatchGateways({
			config: {
				dispatchSettings: {
					type: "found",
					source: [
						"[dispatch]",
						'harness = "pi"',
						'vercel_project_id = "prj_Fake123"',
						'vercel_team_id = "team_Fake123"',
					].join("\n"),
				},
			},
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		expect(checkById(result, "dispatch-config").detail).toContain("deployment_url");
	});

	test("names the missing workflow_dashboard_url key", async () => {
		const gateways = createFakeDispatchGateways({
			config: {
				dispatchSettings: {
					type: "found",
					source: [
						"[dispatch]",
						'harness = "pi"',
						'vercel_project_id = "prj_Fake123"',
						'vercel_team_id = "team_Fake123"',
						`deployment_url = "${FAKE_DEPLOYMENT_URL}"`,
					].join("\n"),
				},
			},
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		expect(checkById(result, "dispatch-config").detail).toContain("workflow_dashboard_url");
	});

	test("reports a missing package manifest through the package-manager check", async () => {
		const gateways = createFakeDispatchGateways({
			config: { packageManager: { type: "missing" } },
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const check = checkById(result, "package-manager");
		expect(check.status).toBe("failed");
		expect(check.detail).toContain("ts/package.json#packageManager");
		expect(gateways.trigger.identityCalls).toEqual([]);
	});

	test("reports a package manifest read error without attempting identity", async () => {
		const gateways = createFakeDispatchGateways({
			config: {
				packageManager: { type: "error", message: "permission denied" },
			},
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		expect(checkById(result, "package-manager").detail).toContain("permission denied");
		expect(gateways.trigger.identityCalls).toEqual([]);
	});

	test("rejects a non-exact packageManager without echoing its value", async () => {
		const invalidValue = "pnpm@latest;do-not-expose";
		const gateways = createFakeDispatchGateways({
			config: {
				packageManager: {
					type: "found",
					source: JSON.stringify({ packageManager: invalidValue }),
				},
			},
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const check = checkById(result, "package-manager");
		expect(check.detail).toContain("ts/package.json#packageManager");
		expect(check.detail).not.toContain(invalidValue);
		expect(checkById(result, "trigger-identity").detail).toContain("Skipped");
		expect(gateways.trigger.identityCalls).toEqual([]);
	});

	test("reports the token by name and skips the identity check without it", async () => {
		const gateways = createFakeDispatchGateways({
			token: {
				type: "missing",
				detail:
					"VERCEL_OIDC_TOKEN is not available (checked the process environment and /repo/.env.local).",
			},
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const token = checkById(result, "development-oidc-token");
		expect(token.status).toBe("failed");
		expect(token.detail).toContain("VERCEL_OIDC_TOKEN");
		expect(token.detail).not.toContain(FAKE_OIDC_TOKEN);
		expect(checkById(result, "trigger-identity").detail).toContain("Skipped");
		expect(gateways.trigger.identityCalls).toEqual([]);
	});

	test.each([
		["unauthorized", { type: "unauthorized" } as const, "401"],
		["forbidden", { type: "forbidden" } as const, "403"],
		["endpoint-misconfigured", { type: "endpoint-misconfigured" } as const, "500"],
		[
			"unreachable",
			{ type: "unreachable", message: "connect ECONNREFUSED" } as const,
			"unreachable",
		],
		["unexpected-response", { type: "unexpected-response", status: 302 } as const, "302"],
	])("maps a %s identity result to an actionable failure", async (_label, identity, marker) => {
		const gateways = createFakeDispatchGateways({ trigger: { identity } });
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const check = checkById(result, "trigger-identity");
		expect(check.status).toBe("failed");
		expect(check.detail).toContain(marker);
	});
});
