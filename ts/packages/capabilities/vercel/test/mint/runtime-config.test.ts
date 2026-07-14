import { describe, expect, it } from "vitest";

import {
	normalizeEscapedPemNewlines,
	parseGitHubAppMintConfig,
	parseMintOidcTrustConfig,
	type MintEnvironment,
} from "../../src/mint/runtime-config.ts";

function validGitHubEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_GITHUB_APP_ID: "4282120",
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		NS_DISPATCH_GITHUB_REPOSITORY: "NSENG-AI/NS",
	};
}

function validOidcEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_VERCEL_TEAM_ID: "team_example123",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_example123",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/example",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/example",
	};
}

describe("parseGitHubAppMintConfig", () => {
	it("requires only the four GitHub App variables and normalizes repository and PEM values", () => {
		const result = parseGitHubAppMintConfig(validGitHubEnvironment());

		expect(result).toEqual({
			ok: true,
			value: {
				githubAppId: "4282120",
				githubAppInstallationId: "146155769",
				githubAppPrivateKey:
					"-----BEGIN PRIVATE KEY-----\nprivate-key-fixture\n-----END PRIVATE KEY-----\n",
				githubRepository: "nseng-ai/ns",
			},
		});
	});

	it("ignores OIDC-only variables", () => {
		const result = parseGitHubAppMintConfig({
			...validGitHubEnvironment(),
			NS_DISPATCH_VERCEL_OIDC_ISSUER: "not-a-url",
		});

		expect(result.ok).toBe(true);
	});

	it.each([
		["NS_DISPATCH_GITHUB_APP_ID", "not-an-id"],
		["NS_DISPATCH_GITHUB_APP_INSTALLATION_ID", "0"],
		["NS_DISPATCH_GITHUB_APP_PRIVATE_KEY", "not-a-private-key"],
		["NS_DISPATCH_GITHUB_REPOSITORY", "https://github.com/nseng-ai/ns"],
	] as const)("names only %s when its value is invalid", (variable, invalidValue) => {
		const result = parseGitHubAppMintConfig({
			...validGitHubEnvironment(),
			[variable]: invalidValue,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "mint-endpoint-misconfigured",
				message: `Mint endpoint configuration is invalid: ${variable}.`,
				variable,
			},
		});
		expect(JSON.stringify(result)).not.toContain(invalidValue);
	});

	it("names a missing variable without exposing private-key material", () => {
		const { NS_DISPATCH_GITHUB_APP_ID: _omitted, ...environment } = validGitHubEnvironment();

		const result = parseGitHubAppMintConfig(environment);

		expect(result).toMatchObject({
			ok: false,
			error: { variable: "NS_DISPATCH_GITHUB_APP_ID" },
		});
		expect(JSON.stringify(result)).not.toContain("private-key-fixture");
	});
});

describe("parseMintOidcTrustConfig", () => {
	it("wraps the shared OIDC trust slice with the mint endpoint contract", () => {
		expect(parseMintOidcTrustConfig(validOidcEnvironment())).toEqual({
			ok: true,
			value: {
				vercelTeamId: "team_example123",
				vercelProjectId: "prj_example123",
				vercelOidcIssuer: "https://oidc.vercel.com/example",
				vercelOidcAudience: "https://vercel.com/example",
			},
		});
	});

	it.each([
		["NS_DISPATCH_VERCEL_TEAM_ID", "not-a-team-id"],
		["NS_DISPATCH_VERCEL_PROJECT_ID", "not-a-project-id"],
		["NS_DISPATCH_VERCEL_OIDC_ISSUER", "not-a-url"],
		["NS_DISPATCH_VERCEL_OIDC_AUDIENCE", "not-an-audience-url"],
	] as const)("preserves the mint error contract for %s", (variable, invalidValue) => {
		const result = parseMintOidcTrustConfig({
			...validOidcEnvironment(),
			[variable]: invalidValue,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "mint-endpoint-misconfigured",
				message: `Mint endpoint configuration is invalid: ${variable}.`,
				variable,
			},
		});
		expect(JSON.stringify(result)).not.toContain(invalidValue);
	});
});

describe("normalizeEscapedPemNewlines", () => {
	it("changes only escaped newline sequences", () => {
		expect(normalizeEscapedPemNewlines("first\\nsecond\nthird")).toBe("first\nsecond\nthird");
	});
});
