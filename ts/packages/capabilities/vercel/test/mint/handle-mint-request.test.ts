import { describe, expect, it } from "vitest";

import type { MintPurpose } from "../../src/mint/contracts.ts";
import {
	createDevelopmentCallerAuthenticator,
	type VercelOidcGateway,
	type VercelOidcVerificationResult,
} from "../../src/auth/development-oidc.ts";
import { handleMintRequest } from "../../src/mint/handle-mint-request.ts";
import {
	createDispatchTokenMinter,
	type GitHubInstallationTokenGateway,
	type GitHubInstallationTokenResult,
} from "../../src/mint/mint-core.ts";
import type { OidcTrustConfig } from "../../src/auth/oidc-trust-config.ts";

const oidcTrust: OidcTrustConfig = {
	vercelTeamId: "team_dispatch",
	vercelProjectId: "prj_dispatch",
	vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
	vercelOidcAudience: "https://vercel.com/nseng-ai",
};

class InMemoryVercelOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;
	readonly calls: string[] = [];

	constructor(result: VercelOidcVerificationResult) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(token: string): Promise<VercelOidcVerificationResult> {
		this.calls.push(token);
		return this.#result;
	}
}

class InMemoryGitHubInstallationTokenGateway implements GitHubInstallationTokenGateway {
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

function oidcIdentity(
	overrides: Partial<{ ownerId: string; projectId: string; environment: string }> = {},
): VercelOidcVerificationResult {
	return {
		ok: true,
		value: {
			ownerId: "team_dispatch",
			projectId: "prj_dispatch",
			environment: "development",
			...overrides,
		},
	};
}

function successfulGitHubResult(): GitHubInstallationTokenResult {
	return {
		ok: true,
		value: { token: "installation-token", expiresAt: "2026-07-12T18:00:00Z" },
	};
}

function createContext(
	options: {
		oidc?: InMemoryVercelOidcGateway;
		github?: InMemoryGitHubInstallationTokenGateway;
	} = {},
) {
	const oidc = options.oidc ?? new InMemoryVercelOidcGateway(oidcIdentity());
	const github =
		options.github ?? new InMemoryGitHubInstallationTokenGateway(successfulGitHubResult());
	const minter = createDispatchTokenMinter({ repository: "nseng-ai/ns", github });
	return {
		context: { developmentCaller: createDevelopmentCallerAuthenticator(oidcTrust, oidc), minter },
		oidc,
		github,
	};
}

describe("handleMintRequest", () => {
	it("authorizes a development-project OIDC caller to mint a clone token", async () => {
		const { context, oidc, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "NSENG-AI/NS", purpose: "clone" },
				oidcToken: "vercel-token",
			},
			context,
		);

		expect(result).toEqual({
			status: 200,
			body: {
				token: "installation-token",
				expiresAt: "2026-07-12T18:00:00Z",
				repository: "nseng-ai/ns",
				purpose: "clone",
			},
		});
		expect(oidc.calls).toEqual(["vercel-token"]);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it.each([
		["missing token", null],
		["empty token", ""],
	] as const)("rejects a %s as unauthorized", async (_name, oidcToken) => {
		const { context, github } = createContext();

		const result = await handleMintRequest(
			{ body: { repository: "nseng-ai/ns", purpose: "clone" }, oidcToken },
			context,
		);

		expect(result).toEqual({
			status: 401,
			body: { error: { code: "unauthorized", message: "Authentication failed." } },
		});
		expect(github.calls).toEqual([]);
		expect(JSON.stringify(result)).not.toContain("installation-token");
	});

	it("rejects failed OIDC verification as unauthorized", async () => {
		const oidc = new InMemoryVercelOidcGateway({ ok: false });
		const { context, github } = createContext({ oidc });

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "clone" },
				oidcToken: "invalid-token-must-not-leak",
			},
			context,
		);

		expect(result.status).toBe(401);
		expect(github.calls).toEqual([]);
		expect(JSON.stringify(result)).not.toContain("invalid-token-must-not-leak");
	});

	it.each([
		["preview environment", { environment: "preview" }],
		["production environment", { environment: "production" }],
		["wrong team", { ownerId: "team_other" }],
		["wrong project", { projectId: "prj_other" }],
	] as const)("forbids %s OIDC claims", async (_name, overrides) => {
		const oidc = new InMemoryVercelOidcGateway(oidcIdentity(overrides));
		const { context, github } = createContext({ oidc });

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "clone" },
				oidcToken: "valid-token",
			},
			context,
		);

		expect(result.status).toBe(403);
		expect(github.calls).toEqual([]);
	});

	it("forbids authenticated landing-purpose HTTP minting without GitHub access", async () => {
		const { context, oidc, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "landing" },
				oidcToken: "valid-token",
			},
			context,
		);

		expect(result).toEqual({
			status: 403,
			body: { error: { code: "forbidden", message: "Mint request is not authorized." } },
		});
		expect(oidc.calls).toEqual(["valid-token"]);
		expect(github.calls).toEqual([]);
		expect(JSON.stringify(result)).not.toContain("installation-token");
	});

	it("rejects an unauthenticated landing-purpose request as unauthorized", async () => {
		const { context, oidc, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "landing" },
				oidcToken: null,
			},
			context,
		);

		expect(result).toEqual({
			status: 401,
			body: { error: { code: "unauthorized", message: "Authentication failed." } },
		});
		expect(oidc.calls).toEqual([]);
		expect(github.calls).toEqual([]);
	});

	it.each([
		["unknown field", { repository: "nseng-ai/ns", purpose: "clone", extra: true }],
		["repository URL", { repository: "https://github.com/nseng-ai/ns", purpose: "clone" }],
		["git suffix", { repository: "nseng-ai/ns.git", purpose: "clone" }],
		["nested path", { repository: "nseng-ai/ns/subdir", purpose: "clone" }],
		["unknown purpose", { repository: "nseng-ai/ns", purpose: "push" }],
		["array", []],
	] as const)("rejects an invalid request with %s", async (_name, body) => {
		const { context, github } = createContext();

		const result = await handleMintRequest({ body, oidcToken: "valid-token" }, context);

		expect(result).toEqual({
			status: 400,
			body: { error: { code: "invalid-request", message: "Invalid mint request." } },
		});
		expect(github.calls).toEqual([]);
	});

	it("forbids a valid repository other than the configured repository", async () => {
		const { context, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/other", purpose: "clone" },
				oidcToken: "valid-token",
			},
			context,
		);

		expect(result.status).toBe(403);
		expect(github.calls).toEqual([]);
	});

	it("returns only a safe failure when GitHub minting fails", async () => {
		const github = new InMemoryGitHubInstallationTokenGateway({ ok: false });
		const { context } = createContext({ github });

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "clone" },
				oidcToken: "oidc-token-must-not-leak",
			},
			context,
		);

		expect(result).toEqual({
			status: 502,
			body: {
				error: {
					code: "github-token-mint-failed",
					message: "GitHub token mint failed.",
				},
			},
		});
		expect(JSON.stringify(result)).not.toContain("oidc-token-must-not-leak");
	});
});
