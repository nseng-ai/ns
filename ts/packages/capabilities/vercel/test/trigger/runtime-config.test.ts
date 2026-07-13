import { describe, expect, it } from "vitest";

import {
	parseTriggerRuntimeConfig,
	type TriggerEnvironment,
} from "../../src/trigger/runtime-config.ts";

function validEnvironment(): TriggerEnvironment {
	return {
		NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
	};
}

describe("parseTriggerRuntimeConfig", () => {
	it("parses the four trigger-relevant NS_DISPATCH_* variables", () => {
		expect(parseTriggerRuntimeConfig(validEnvironment())).toEqual({
			ok: true,
			value: {
				vercelTeamId: "team_dispatch",
				vercelProjectId: "prj_dispatch",
				vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
				vercelOidcAudience: "https://vercel.com/nseng-ai",
			},
		});
	});

	it("ignores unrelated environment variables", () => {
		const result = parseTriggerRuntimeConfig({
			...validEnvironment(),
			NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: "unused-by-the-trigger-route",
			PATH: "/usr/bin",
		});

		expect(result.ok).toBe(true);
	});

	it.each([
		["NS_DISPATCH_VERCEL_TEAM_ID", "not-a-team-id"],
		["NS_DISPATCH_VERCEL_PROJECT_ID", "not-a-project-id"],
		["NS_DISPATCH_VERCEL_OIDC_ISSUER", "not-a-url"],
		["NS_DISPATCH_VERCEL_OIDC_AUDIENCE", "not-a-url"],
	])("reports %s by name without echoing its value", (variable, value) => {
		const result = parseTriggerRuntimeConfig({ ...validEnvironment(), [variable]: value });

		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.error).toEqual({
				code: "trigger-endpoint-misconfigured",
				message: `Trigger endpoint configuration is invalid: ${variable}.`,
				variable,
			});
		}
	});

	it("reports a missing variable by name", () => {
		const { NS_DISPATCH_VERCEL_OIDC_AUDIENCE: _omitted, ...environment } = validEnvironment();

		const result = parseTriggerRuntimeConfig(environment);

		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.error.variable).toBe("NS_DISPATCH_VERCEL_OIDC_AUDIENCE");
		}
	});
});
