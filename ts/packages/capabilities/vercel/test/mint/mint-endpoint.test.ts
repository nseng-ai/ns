import { describe, expect, it } from "vitest";

import { createMintPostHandler } from "../../api/mint.ts";
import type { MintPurpose } from "../../src/mint/contracts.ts";
import type {
	GitHubInstallationTokenGateway,
	GitHubInstallationTokenResult,
} from "../../src/mint/mint-core.ts";
import type { OidcTrustConfig } from "../../src/auth/oidc-trust-config.ts";
import type { GitHubAppAuthenticationConfig } from "../../src/mint/real-gateways.ts";
import type { MintEnvironment } from "../../src/mint/runtime-config.ts";
import {
	DEVELOPMENT_OIDC_TRUST_ENVIRONMENT,
	InMemoryVercelOidcGateway,
} from "../support/route-fakes.ts";

class RecordingGitHubGateway implements GitHubInstallationTokenGateway {
	readonly #result: GitHubInstallationTokenResult;
	readonly calls: Array<{ repository: string; purpose: MintPurpose }> = [];

	constructor(result: GitHubInstallationTokenResult) {
		this.#result = result;
	}

	async mintRepositoryToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<GitHubInstallationTokenResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

function successfulGitHubGateway(): RecordingGitHubGateway {
	return new RecordingGitHubGateway({
		ok: true,
		value: {
			token: "installation-token",
			expiresAt: "2026-07-12T18:00:00Z",
		},
	});
}

function validEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_GITHUB_APP_ID: "4282120",
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		NS_DISPATCH_GITHUB_REPOSITORY: "nseng-ai/ns",
		...DEVELOPMENT_OIDC_TRUST_ENVIRONMENT,
	};
}

function validOidcGateway(): InMemoryVercelOidcGateway {
	return new InMemoryVercelOidcGateway();
}

function mintRequest(
	options: {
		readonly purpose?: MintPurpose;
		readonly oidcToken?: string;
		readonly bearerToken?: string;
	} = {},
): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (options.oidcToken !== undefined) {
		headers.set("x-ns-dispatch-oidc-token", options.oidcToken);
	}
	if (options.bearerToken !== undefined) {
		headers.set("Authorization", `Bearer ${options.bearerToken}`);
	}
	return new Request("https://dispatch.example/api/mint", {
		method: "POST",
		headers,
		body: JSON.stringify({
			repository: "NSENG-AI/NS",
			purpose: options.purpose ?? "clone",
		}),
	});
}

describe("createMintPostHandler", () => {
	it("composes exact GitHub App and OIDC slices for a no-store clone response", async () => {
		const github = successfulGitHubGateway();
		const oidcConfigs: OidcTrustConfig[] = [];
		const githubConfigs: GitHubAppAuthenticationConfig[] = [];
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: (config) => {
				oidcConfigs.push({ ...config });
				return validOidcGateway();
			},
			createGitHubGateway: (config) => {
				githubConfigs.push({ ...config });
				return github;
			},
		});

		const response = await handler(mintRequest({ oidcToken: "oidc-token" }));

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.text()).toBe(
			'{"token":"installation-token","expiresAt":"2026-07-12T18:00:00Z","repository":"nseng-ai/ns","purpose":"clone"}',
		);
		expect(oidcConfigs).toEqual([
			{
				vercelTeamId: "team_dispatch",
				vercelProjectId: "prj_dispatch",
				vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
				vercelOidcAudience: "https://vercel.com/nseng-ai",
			},
		]);
		expect(githubConfigs).toEqual([
			{
				githubAppId: "4282120",
				githubAppInstallationId: "146155769",
				githubAppPrivateKey:
					"-----BEGIN PRIVATE KEY-----\nprivate-key-fixture\n-----END PRIVATE KEY-----\n",
			},
		]);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("ignores Vercel's reserved workload-identity header", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});
		const request = mintRequest();
		request.headers.set("x-vercel-oidc-token", "production-workload-token");

		const response = await handler(request);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(github.calls).toEqual([]);
	});

	it("does not treat a Bearer credential as clone authentication", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(mintRequest({ bearerToken: "retired-channel-credential" }));
		const body = await response.text();

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).not.toContain("retired-channel-credential");
		expect(github.calls).toEqual([]);
	});

	it("does not let a Bearer credential enable landing minting", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(
			mintRequest({ purpose: "landing", bearerToken: "retired-channel-credential" }),
		);
		const body = await response.text();

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).not.toContain("retired-channel-credential");
		expect(github.calls).toEqual([]);
	});

	it("ignores a Bearer credential when the dispatch-owned OIDC header is valid", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(
			mintRequest({ oidcToken: "oidc-token", bearerToken: "must-be-ignored" }),
		);

		expect(response.status).toBe(200);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("forbids a landing purpose even when both legacy and OIDC headers are present", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(
			mintRequest({
				purpose: "landing",
				oidcToken: "oidc-token-must-not-leak",
				bearerToken: "retired-channel-must-not-enable-landing",
			}),
		);
		const body = await response.text();

		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toBe('{"error":{"code":"forbidden","message":"Mint request is not authorized."}}');
		expect(body).not.toContain("oidc-token-must-not-leak");
		expect(body).not.toContain("retired-channel-must-not-enable-landing");
		expect(body).not.toContain("installation-token");
		expect(github.calls).toEqual([]);
	});

	it("returns a safe no-store 400 for malformed JSON", async () => {
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => successfulGitHubGateway(),
		});

		const response = await handler(
			new Request("https://dispatch.example/api/mint", {
				method: "POST",
				headers: { "x-ns-dispatch-oidc-token": "oidc-token" },
				body: "{",
			}),
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			error: { code: "invalid-request", message: "Invalid mint request." },
		});
	});

	it("returns a variable-name-only no-store 500 for invalid GitHub App configuration", async () => {
		const environment = {
			...validEnvironment(),
			NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: "private-value-must-not-leak",
		};
		const handler = createMintPostHandler({ environment });

		const response = await handler(mintRequest());
		const body = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toContain("NS_DISPATCH_GITHUB_APP_PRIVATE_KEY");
		expect(body).not.toContain("private-value-must-not-leak");
	});

	it("requires the OIDC trust slice and does not expose an invalid value", async () => {
		const invalidIssuer = "oidc-issuer-value-must-not-leak";
		const handler = createMintPostHandler({
			environment: {
				...validEnvironment(),
				NS_DISPATCH_VERCEL_OIDC_ISSUER: invalidIssuer,
			},
		});

		const response = await handler(mintRequest());
		const body = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toContain("NS_DISPATCH_VERCEL_OIDC_ISSUER");
		expect(body).not.toContain(invalidIssuer);
	});

	it("returns a safe no-store 502 without key, OIDC, or token material", async () => {
		const github = new RecordingGitHubGateway({ ok: false });
		const environment = validEnvironment();
		const handler = createMintPostHandler({
			environment,
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(mintRequest({ oidcToken: "oidc-token-must-not-leak" }));
		const body = await response.text();

		expect(response.status).toBe(502);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toBe(
			'{"error":{"code":"github-token-mint-failed","message":"GitHub token mint failed."}}',
		);
		expect(body).not.toContain("private-key-fixture");
		expect(body).not.toContain("oidc-token-must-not-leak");
		expect(body).not.toContain("installation-token");
	});
});
