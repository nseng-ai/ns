import { describe, expect, test } from "vitest";

import { runDispatchPreflight } from "../../src/ns/dispatch-prompt/core.ts";
import {
	createFakeDispatchGateways,
	FAKE_DEPLOYMENT_URL,
	FAKE_OIDC_TOKEN,
} from "./support/dispatch-prompt-fakes.ts";

function checkById(
	result: Awaited<ReturnType<typeof runDispatchPreflight>>,
	id: "dispatch-config" | "development-oidc-token" | "trigger-identity",
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
		expect(result.checks.map((check) => check.status)).toEqual(["ok", "ok", "ok"]);
		if (result.ok) {
			expect(result.deploymentUrl).toBe(FAKE_DEPLOYMENT_URL);
			expect(result.oidcToken).toBe(FAKE_OIDC_TOKEN);
		}
		// The identity preflight carried the token to the configured deployment.
		expect(gateways.trigger.identityCalls).toEqual([
			{ deploymentUrl: FAKE_DEPLOYMENT_URL, oidcToken: FAKE_OIDC_TOKEN },
		]);
	});

	test("reports a missing ns.toml as an actionable config failure", async () => {
		const gateways = createFakeDispatchGateways({ configSource: null });
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		const config = checkById(result, "dispatch-config");
		expect(config.status).toBe("failed");
		expect(config.detail).toContain("ns.toml");
		expect(config.detail).toContain("[dispatch]");
	});

	test("names the missing deployment_url key without failing the whole table", async () => {
		const gateways = createFakeDispatchGateways({
			configSource: [
				"[dispatch]",
				'harness = "pi"',
				'vercel_project_id = "prj_Fake123"',
				'vercel_team_id = "team_Fake123"',
			].join("\n"),
		});
		const result = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);

		expect(result.ok).toBe(false);
		expect(checkById(result, "dispatch-config").detail).toContain("deployment_url");
	});

	test("reports the token by name and skips the identity check without it", async () => {
		const gateways = createFakeDispatchGateways({
			token: {
				type: "missing",
				detail:
					"VERCEL_OIDC_TOKEN is not available (checked the process environment and /pkg/.env.local).",
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
