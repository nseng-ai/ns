import { describe, expect, it } from "vitest";

import {
	normalizeEscapedPemNewlines,
	parseMintRuntimeConfig,
	type MintEnvironment,
} from "../../src/mint/runtime-config.ts";

function validEnvironment(): MintEnvironment {
	return {
		DISPATCH_GITHUB_APP_ID: "4282120",
		DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		DISPATCH_SANDBOX_MINT_SECRET: "shared-secret-fixture",
		DISPATCH_GITHUB_REPOSITORY: "NSENG-AI/NS",
		DISPATCH_VERCEL_TEAM_ID: "team_example123",
		DISPATCH_VERCEL_PROJECT_ID: "prj_example123",
		DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/example",
		DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/example",
	};
}

describe("parseMintRuntimeConfig", () => {
	it("parses every required variable and normalizes repository and PEM values", () => {
		const result = parseMintRuntimeConfig(validEnvironment());

		expect(result).toEqual({
			ok: true,
			value: {
				githubAppId: "4282120",
				githubAppInstallationId: "146155769",
				githubAppPrivateKey:
					"-----BEGIN PRIVATE KEY-----\nprivate-key-fixture\n-----END PRIVATE KEY-----\n",
				sandboxMintSecret: "shared-secret-fixture",
				githubRepository: "nseng-ai/ns",
				vercelTeamId: "team_example123",
				vercelProjectId: "prj_example123",
				vercelOidcIssuer: "https://oidc.vercel.com/example",
				vercelOidcAudience: "https://vercel.com/example",
			},
		});
	});

	it.each([
		["DISPATCH_GITHUB_APP_ID", "not-an-id"],
		["DISPATCH_GITHUB_APP_INSTALLATION_ID", "0"],
		["DISPATCH_GITHUB_APP_PRIVATE_KEY", "not-a-private-key"],
		["DISPATCH_SANDBOX_MINT_SECRET", ""],
		["DISPATCH_GITHUB_REPOSITORY", "https://github.com/nseng-ai/ns"],
		["DISPATCH_VERCEL_TEAM_ID", "example-team"],
		["DISPATCH_VERCEL_PROJECT_ID", "example-project"],
		["DISPATCH_VERCEL_OIDC_ISSUER", "not-a-url"],
		["DISPATCH_VERCEL_OIDC_AUDIENCE", "not-an-audience-url"],
	] as const)("names only %s when its value is invalid", (variable, invalidValue) => {
		const result = parseMintRuntimeConfig({ ...validEnvironment(), [variable]: invalidValue });

		expect(result).toEqual({
			ok: false,
			error: {
				code: "mint-endpoint-misconfigured",
				message: `Mint endpoint configuration is invalid: ${variable}.`,
				variable,
			},
		});
		if (invalidValue.length > 0) expect(JSON.stringify(result)).not.toContain(invalidValue);
	});

	it("names a missing variable without exposing other environment values", () => {
		const environment = { ...validEnvironment(), DISPATCH_GITHUB_APP_ID: undefined };

		const result = parseMintRuntimeConfig(environment);

		expect(result).toMatchObject({
			ok: false,
			error: {
				variable: "DISPATCH_GITHUB_APP_ID",
			},
		});
		expect(JSON.stringify(result)).not.toContain("shared-secret-fixture");
		expect(JSON.stringify(result)).not.toContain("private-key-fixture");
	});
});

describe("normalizeEscapedPemNewlines", () => {
	it("changes only escaped newline sequences", () => {
		expect(normalizeEscapedPemNewlines("first\\nsecond\nthird")).toBe("first\nsecond\nthird");
	});
});
