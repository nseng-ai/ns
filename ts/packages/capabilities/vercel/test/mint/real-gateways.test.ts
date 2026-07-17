import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
	createGitHubAppDispatchTokenMinter,
	createGitHubInstallationTokenGateway,
	type AppAuthFactoryOptions,
	type InstallationAuthentication,
	type InstallationAuthOptions,
} from "../../src/mint/real-gateways.ts";
import {
	createJoseDevelopmentCallerAuthenticator,
	createJoseVercelOidcGateway,
} from "../../src/auth/development-oidc.ts";
import type { OidcTrustConfig } from "../../src/auth/oidc-trust-config.ts";
import type { GitHubAppMintConfig } from "../../src/mint/runtime-config.ts";

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

const config: GitHubAppMintConfig = {
	githubAppId: "4282120",
	githubAppInstallationId: "146155769",
	githubAppPrivateKey: "private-key-fixture",
	githubRepository: "nseng-ai/ns",
};

const oidcTrust: OidcTrustConfig = {
	vercelTeamId: "team_dispatch",
	vercelProjectId: "prj_dispatch",
	vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
	vercelOidcAudience: "https://vercel.com/nseng-ai",
};

class RecordingAppAuthFactory {
	readonly #authentication: InstallationAuthentication;
	readonly factoryCalls: AppAuthFactoryOptions[] = [];
	readonly authCalls: InstallationAuthOptions[] = [];

	constructor(authentication: InstallationAuthentication) {
		this.#authentication = authentication;
	}

	create(options: AppAuthFactoryOptions) {
		this.factoryCalls.push({ ...options });
		return async (authOptions: InstallationAuthOptions): Promise<InstallationAuthentication> => {
			this.authCalls.push({
				...authOptions,
				repositoryNames: [...authOptions.repositoryNames],
				permissions: { ...authOptions.permissions },
			});
			return this.#authentication;
		};
	}
}

function successfulAuthentication(): InstallationAuthentication {
	return { token: "installation-token", expiresAt: "2026-07-12T18:00:00Z" };
}

describe("createGitHubInstallationTokenGateway", () => {
	it.each([
		["clone", { contents: "read" }],
		["landing", { contents: "write", pull_requests: "write", issues: "write" }],
	] as const)("requests one repository with exact %s permissions", async (purpose, permissions) => {
		const authFactory = new RecordingAppAuthFactory(successfulAuthentication());
		const gateway = createGitHubInstallationTokenGateway(config, (options) =>
			authFactory.create(options),
		);

		const result = await gateway.mintRepositoryToken({
			repository: "nseng-ai/ns",
			purpose,
		});

		expect(result).toEqual({ ok: true, value: successfulAuthentication() });
		expect(authFactory.factoryCalls).toEqual([
			{
				appId: config.githubAppId,
				installationId: config.githubAppInstallationId,
				privateKey: config.githubAppPrivateKey,
			},
		]);
		expect(authFactory.authCalls).toEqual([
			{
				type: "installation",
				installationId: config.githubAppInstallationId,
				repositoryNames: ["ns"],
				permissions,
				refresh: true,
			},
		]);
	});

	it("normalizes malformed vendor output to a safe failure", async () => {
		const authFactory = new RecordingAppAuthFactory({
			token: "vendor-secret",
			expiresAt: "not-an-iso-timestamp",
		});
		const gateway = createGitHubInstallationTokenGateway(config, (options) =>
			authFactory.create(options),
		);

		const result = await gateway.mintRepositoryToken({
			repository: "nseng-ai/ns",
			purpose: "clone",
		});

		expect(result).toEqual({
			ok: false,
			reason: "invalid-response",
			message: "GitHub App authentication returned an invalid installation token response",
		});
		expect(JSON.stringify(result)).not.toContain("vendor-secret");
	});

	it("retains the raw App authentication error message", async () => {
		const gateway = createGitHubInstallationTokenGateway(config, () => async () => {
			throw new Error("GitHub App auth connection reset");
		});

		expect(
			await gateway.mintRepositoryToken({ repository: "nseng-ai/ns", purpose: "clone" }),
		).toEqual({
			ok: false,
			reason: "transport-failed",
			message: "GitHub App auth connection reset",
		});
	});

	it.each([
		[401, "authentication-failed"],
		[403, "request-rejected"],
		[404, "target-not-found"],
		[429, "rate-limited"],
		[503, "upstream-unavailable"],
	] as const)("classifies an App authentication HTTP %s without exposing response data", async (status, reason) => {
		const gateway = createGitHubInstallationTokenGateway(config, () => async () => {
			throw Object.assign(new Error("safe vendor diagnostic"), { status });
		});

		expect(
			await gateway.mintRepositoryToken({ repository: "nseng-ai/ns", purpose: "clone" }),
		).toEqual({ ok: false, reason, message: "safe vendor diagnostic" });
	});
});

describe("createGitHubAppDispatchTokenMinter", () => {
	it("mints an in-process landing token through the App-key auth path", async () => {
		const authFactory = new RecordingAppAuthFactory(successfulAuthentication());
		const minter = createGitHubAppDispatchTokenMinter(config, (options) =>
			authFactory.create(options),
		);

		const result = await minter.mintDispatchToken({
			repository: "nseng-ai/ns",
			purpose: "landing",
		});

		expect(result).toEqual({
			ok: true,
			value: {
				token: "installation-token",
				expiresAt: "2026-07-12T18:00:00Z",
				repository: "nseng-ai/ns",
				purpose: "landing",
			},
		});
		expect(authFactory.authCalls).toEqual([
			{
				type: "installation",
				installationId: config.githubAppInstallationId,
				repositoryNames: ["ns"],
				permissions: { contents: "write", pull_requests: "write", issues: "write" },
				refresh: true,
			},
		]);
	});

	it("enforces the configured-repository constraint before touching App auth", async () => {
		const authFactory = new RecordingAppAuthFactory(successfulAuthentication());
		const minter = createGitHubAppDispatchTokenMinter(config, (options) =>
			authFactory.create(options),
		);

		const result = await minter.mintDispatchToken({
			repository: "nseng-ai/other",
			purpose: "clone",
		});

		expect(result).toEqual({ ok: false, error: { code: "repository-not-allowed" } });
		expect(authFactory.factoryCalls).toEqual([]);
		expect(authFactory.authCalls).toEqual([]);
	});
});

describe("createJoseVercelOidcGateway", () => {
	it("captures the complete development-caller trust policy at construction", async () => {
		const { publicKey, privateKey } = await generateKeyPair("ES256");
		const mutableTrust = { ...oidcTrust };
		const authenticator = createJoseDevelopmentCallerAuthenticator(mutableTrust, {
			keyResolver: async () => publicKey,
		});
		mutableTrust.vercelTeamId = "team_changed";
		mutableTrust.vercelProjectId = "project_changed";
		mutableTrust.vercelOidcIssuer = "https://oidc.vercel.com/changed";
		mutableTrust.vercelOidcAudience = "https://vercel.com/changed";

		const result = await authenticator.authenticate(await signedToken(privateKey, {}));

		expect(result).toEqual({ ok: true });
	});

	it("verifies a locally signed token against construction-bound trust", async () => {
		const { publicKey, privateKey } = await generateKeyPair("ES256");
		const gateway = createJoseVercelOidcGateway(oidcTrust, {
			keyResolver: async () => publicKey,
		});
		const token = await signedToken(privateKey, {});

		const result = await gateway.verifyDevelopmentIdentity(token);

		expect(result).toEqual({
			ok: true,
			value: {
				ownerId: oidcTrust.vercelTeamId,
				projectId: oidcTrust.vercelProjectId,
				environment: "development",
			},
		});
	});

	it.each([
		["issuer", { issuer: "https://oidc.vercel.com/other" }],
		["audience", { audience: "https://vercel.com/other" }],
		["expiration", { expiration: "-1s" }],
	] as const)("rejects a token with the wrong %s", async (_name, overrides) => {
		const { publicKey, privateKey } = await generateKeyPair("ES256");
		const gateway = createJoseVercelOidcGateway(oidcTrust, {
			keyResolver: async () => publicKey,
		});
		const token = await signedToken(privateKey, overrides);

		const result = await gateway.verifyDevelopmentIdentity(token);

		expect(result).toEqual({ ok: false });
	});

	it("rejects a valid signature when required temporal claims are absent", async () => {
		const { publicKey, privateKey } = await generateKeyPair("ES256");
		const gateway = createJoseVercelOidcGateway(oidcTrust, {
			keyResolver: async () => publicKey,
		});
		const token = await new SignJWT({
			owner_id: oidcTrust.vercelTeamId,
			project_id: oidcTrust.vercelProjectId,
			environment: "development",
		})
			.setProtectedHeader({ alg: "ES256", kid: "fixture" })
			.setIssuer(oidcTrust.vercelOidcIssuer)
			.setAudience(oidcTrust.vercelOidcAudience)
			.sign(privateKey);

		const result = await gateway.verifyDevelopmentIdentity(token);

		expect(result).toEqual({ ok: false });
	});
});

interface SignedTokenOverrides {
	readonly issuer?: string;
	readonly audience?: string;
	readonly expiration?: string;
}

async function signedToken(
	privateKey: SigningKey,
	overrides: SignedTokenOverrides,
): Promise<string> {
	return new SignJWT({
		owner_id: oidcTrust.vercelTeamId,
		project_id: oidcTrust.vercelProjectId,
		environment: "development",
	})
		.setProtectedHeader({ alg: "ES256", kid: "fixture" })
		.setIssuer(overrides.issuer ?? oidcTrust.vercelOidcIssuer)
		.setAudience(overrides.audience ?? oidcTrust.vercelOidcAudience)
		.setIssuedAt()
		.setExpirationTime(overrides.expiration ?? "5m")
		.sign(privateKey);
}
