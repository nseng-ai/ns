import { describe, expect, it } from "vitest";

import { createMintPostHandler } from "../../deployable/api/mint.ts";
import type { MintPurpose } from "../../src/mint/contracts.ts";
import type {
	GitHubInstallationTokenGateway,
	VercelOidcGateway,
	VercelOidcVerificationResult,
} from "../../src/mint/handle-mint-request.ts";
import type { MintEnvironment } from "../../src/mint/runtime-config.ts";

class InMemoryOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;

	constructor(result: VercelOidcVerificationResult) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(): Promise<VercelOidcVerificationResult> {
		return this.#result;
	}
}

class RecordingGitHubGateway implements GitHubInstallationTokenGateway {
	readonly #token: string;
	readonly #expiresAt: string;
	readonly calls: Array<{ repository: string; purpose: MintPurpose }> = [];

	constructor(options: { readonly token: string; readonly expiresAt: string }) {
		this.#token = options.token;
		this.#expiresAt = options.expiresAt;
	}

	async mintRepositoryToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}) {
		this.calls.push({ ...options });
		return {
			ok: true as const,
			value: { token: this.#token, expiresAt: this.#expiresAt },
		};
	}
}

function successfulGitHubGateway(): RecordingGitHubGateway {
	return new RecordingGitHubGateway({
		token: "installation-token",
		expiresAt: "2026-07-12T18:00:00Z",
	});
}

function validEnvironment(): MintEnvironment {
	return {
		DISPATCH_GITHUB_APP_ID: "4282120",
		DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		DISPATCH_SANDBOX_MINT_SECRET: "landing-secret",
		DISPATCH_GITHUB_REPOSITORY: "nseng-ai/ns",
		DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
	};
}

function validOidcGateway(): InMemoryOidcGateway {
	return new InMemoryOidcGateway({
		ok: true,
		value: {
			ownerId: "team_dispatch",
			projectId: "prj_dispatch",
			environment: "development",
		},
	});
}

describe("createMintPostHandler", () => {
	it("returns a strict successful response with cache prevention", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/mint", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-vercel-oidc-token": "oidc-token",
				},
				body: JSON.stringify({ repository: "NSENG-AI/NS", purpose: "clone" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			token: "installation-token",
			expiresAt: "2026-07-12T18:00:00Z",
			repository: "nseng-ai/ns",
			purpose: "clone",
		});
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("supports the landing Bearer channel without replacing ambient environment", async () => {
		const github = successfulGitHubGateway();
		const handler = createMintPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createGitHubGateway: () => github,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/mint", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer landing-secret",
				},
				body: JSON.stringify({ repository: "nseng-ai/ns", purpose: "landing" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "landing" }]);
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
				headers: { "x-vercel-oidc-token": "oidc-token" },
				body: "{",
			}),
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			error: { code: "invalid-request", message: "Invalid mint request." },
		});
	});

	it("returns a variable-name-only no-store 500 for invalid runtime configuration", async () => {
		const environment = {
			...validEnvironment(),
			DISPATCH_GITHUB_APP_PRIVATE_KEY: "private-value-must-not-leak",
		};
		const handler = createMintPostHandler({ environment });

		const response = await handler(
			new Request("https://dispatch.example/api/mint", {
				method: "POST",
				body: "{}",
			}),
		);
		const body = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toContain("DISPATCH_GITHUB_APP_PRIVATE_KEY");
		expect(body).not.toContain("private-value-must-not-leak");
	});
});
