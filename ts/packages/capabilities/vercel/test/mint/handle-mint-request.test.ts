import { describe, expect, it } from "vitest";

import type { MintPurpose } from "../../src/mint/contracts.ts";
import type {
	VercelOidcGateway,
	VercelOidcVerificationResult,
} from "../../src/mint/development-oidc.ts";
import {
	handleMintRequest,
	type LandingCredentialGateway,
} from "../../src/mint/handle-mint-request.ts";
import {
	createDispatchTokenMinter,
	type GitHubInstallationTokenGateway,
	type GitHubInstallationTokenResult,
} from "../../src/mint/mint-core.ts";
import type { MintRuntimeConfig } from "../../src/mint/runtime-config.ts";

const config: MintRuntimeConfig = {
	githubAppId: "123",
	githubAppInstallationId: "456",
	githubAppPrivateKey: "private-key-must-not-leak",
	sandboxMintSecret: "landing-secret-must-not-leak",
	githubRepository: "nseng-ai/ns",
	vercelTeamId: "team_dispatch",
	vercelProjectId: "prj_dispatch",
	vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
	vercelOidcAudience: "https://vercel.com/nseng-ai",
};

class InMemoryVercelOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;
	readonly calls: Array<{ token: string; issuer: string; audience: string }> = [];

	constructor(result: VercelOidcVerificationResult) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(options: {
		readonly token: string;
		readonly issuer: string;
		readonly audience: string;
	}): Promise<VercelOidcVerificationResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

class InMemoryLandingCredentialGateway implements LandingCredentialGateway {
	readonly #acceptedCredential: string;

	constructor(acceptedCredential: string) {
		this.#acceptedCredential = acceptedCredential;
	}

	verifyLandingCredential(credential: string): boolean {
		return credential === this.#acceptedCredential;
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
		landing?: InMemoryLandingCredentialGateway;
		github?: InMemoryGitHubInstallationTokenGateway;
	} = {},
) {
	const oidc = options.oidc ?? new InMemoryVercelOidcGateway(oidcIdentity());
	const landing = options.landing ?? new InMemoryLandingCredentialGateway("landing-secret");
	const github =
		options.github ?? new InMemoryGitHubInstallationTokenGateway(successfulGitHubResult());
	const minter = createDispatchTokenMinter({ config, github });
	return { context: { config, oidc, landingCredential: landing, minter }, oidc, github };
}

describe("handleMintRequest", () => {
	it("authorizes a development-project OIDC caller to mint a clone token", async () => {
		const { context, oidc, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "NSENG-AI/NS", purpose: "clone" },
				oidcToken: "vercel-token",
				authorization: null,
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
		expect(oidc.calls).toEqual([
			{
				token: "vercel-token",
				issuer: config.vercelOidcIssuer,
				audience: config.vercelOidcAudience,
			},
		]);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("authorizes the shared-secret caller to mint a landing token", async () => {
		const { context, github } = createContext();

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "landing" },
				oidcToken: null,
				authorization: "Bearer landing-secret",
			},
			context,
		);

		expect(result.status).toBe(200);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "landing" }]);
	});

	it.each([
		{
			name: "both auth channels",
			oidcToken: "oidc",
			authorization: "Bearer landing-secret",
		},
		{ name: "neither auth channel", oidcToken: null, authorization: null },
		{ name: "empty OIDC token", oidcToken: "", authorization: null },
		{ name: "malformed Bearer", oidcToken: null, authorization: "Basic abc" },
		{ name: "empty Bearer", oidcToken: null, authorization: "Bearer " },
		{ name: "wrong shared secret", oidcToken: null, authorization: "Bearer wrong" },
	])("rejects $name as unauthorized", async ({ oidcToken, authorization }) => {
		const { context, github } = createContext();

		const result = await handleMintRequest(
			{ body: { repository: "nseng-ai/ns", purpose: "clone" }, oidcToken, authorization },
			context,
		);

		expect(result).toEqual({
			status: 401,
			body: { error: { code: "unauthorized", message: "Authentication failed." } },
		});
		expect(github.calls).toEqual([]);
	});

	it("rejects failed OIDC verification as unauthorized", async () => {
		const oidc = new InMemoryVercelOidcGateway({ ok: false });
		const { context } = createContext({ oidc });

		const result = await handleMintRequest(
			{
				body: { repository: "nseng-ai/ns", purpose: "clone" },
				oidcToken: "invalid-token",
				authorization: null,
			},
			context,
		);

		expect(result.status).toBe(401);
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
				authorization: null,
			},
			context,
		);

		expect(result.status).toBe(403);
		expect(github.calls).toEqual([]);
	});

	it.each([
		["OIDC", "landing", "oidc", null],
		["shared secret", "clone", null, "Bearer landing-secret"],
	] as const)(
		"forbids %s authentication for the %s purpose",
		async (_auth, purpose, oidcToken, authorization) => {
			const { context, github } = createContext();

			const result = await handleMintRequest(
				{ body: { repository: "nseng-ai/ns", purpose }, oidcToken, authorization },
				context,
			);

			expect(result.status).toBe(403);
			expect(github.calls).toEqual([]);
		},
	);

	it.each([
		["unknown field", { repository: "nseng-ai/ns", purpose: "clone", extra: true }],
		["repository URL", { repository: "https://github.com/nseng-ai/ns", purpose: "clone" }],
		["git suffix", { repository: "nseng-ai/ns.git", purpose: "clone" }],
		["nested path", { repository: "nseng-ai/ns/subdir", purpose: "clone" }],
		["unknown purpose", { repository: "nseng-ai/ns", purpose: "push" }],
		["array", []],
	] as const)("rejects an invalid request with %s", async (_name, body) => {
		const { context, github } = createContext();

		const result = await handleMintRequest(
			{ body, oidcToken: "valid-token", authorization: null },
			context,
		);

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
				authorization: null,
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
				oidcToken: "authorization-must-not-leak",
				authorization: null,
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
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain(config.githubAppPrivateKey);
		expect(serialized).not.toContain(config.sandboxMintSecret);
		expect(serialized).not.toContain("authorization-must-not-leak");
	});
});
