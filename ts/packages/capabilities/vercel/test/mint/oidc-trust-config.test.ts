import { describe, expect, it } from "vitest";

import { parseOidcTrustConfig } from "../../src/mint/oidc-trust-config.ts";

function validEnvironment(): Readonly<Record<string, string | undefined>> {
	return {
		NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
	};
}

describe("parseOidcTrustConfig", () => {
	it("parses only the shared OIDC trust variables", () => {
		const result = parseOidcTrustConfig({
			...validEnvironment(),
			NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: "not-a-private-key",
		});

		expect(result).toEqual({
			ok: true,
			value: {
				vercelTeamId: "team_dispatch",
				vercelProjectId: "prj_dispatch",
				vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
				vercelOidcAudience: "https://vercel.com/nseng-ai",
			},
		});
	});

	it("returns only the invalid variable name", () => {
		const invalidValue = "issuer-value-must-not-leak";
		const result = parseOidcTrustConfig({
			...validEnvironment(),
			NS_DISPATCH_VERCEL_OIDC_ISSUER: invalidValue,
		});

		expect(result).toEqual({
			ok: false,
			error: { variable: "NS_DISPATCH_VERCEL_OIDC_ISSUER" },
		});
		expect(JSON.stringify(result)).not.toContain(invalidValue);
	});
});
