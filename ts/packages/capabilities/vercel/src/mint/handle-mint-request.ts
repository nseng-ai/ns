import { mintRequestSchema, type MintPurpose, type MintResponse } from "./contracts.ts";
import type { MintRuntimeConfig } from "./runtime-config.ts";

export interface VercelOidcIdentity {
	readonly ownerId: string;
	readonly projectId: string;
	readonly environment: string;
}

export type VercelOidcVerificationResult =
	| { readonly ok: true; readonly value: VercelOidcIdentity }
	| { readonly ok: false };

export interface VercelOidcGateway {
	verifyDevelopmentIdentity(options: {
		readonly token: string;
		readonly issuer: string;
		readonly audience: string;
	}): Promise<VercelOidcVerificationResult>;
}

export interface LandingCredentialGateway {
	verifyLandingCredential(credential: string): boolean;
}

export interface GitHubInstallationToken {
	readonly token: string;
	readonly expiresAt: string;
}

export type GitHubInstallationTokenResult =
	| { readonly ok: true; readonly value: GitHubInstallationToken }
	| { readonly ok: false };

export interface GitHubInstallationTokenGateway {
	mintRepositoryToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<GitHubInstallationTokenResult>;
}

export interface MintRequestContext {
	readonly config: MintRuntimeConfig;
	readonly oidc: VercelOidcGateway;
	readonly landingCredential: LandingCredentialGateway;
	readonly github: GitHubInstallationTokenGateway;
}

export interface MintRequestInput {
	readonly body: unknown;
	readonly oidcToken: string | null;
	readonly authorization: string | null;
}

export async function handleMintRequest(
	input: MintRequestInput,
	context: MintRequestContext,
): Promise<MintResponse> {
	const requestResult = mintRequestSchema.safeParse(input.body);
	if (!requestResult.success) return failure(400, "invalid-request", "Invalid mint request.");

	const hasOidc = input.oidcToken !== null;
	const hasAuthorization = input.authorization !== null;
	if (hasOidc === hasAuthorization) {
		return failure(401, "unauthorized", "Authentication failed.");
	}

	const authentication = hasOidc
		? await authenticateOidc(input.oidcToken, context)
		: authenticateLanding(input.authorization, context);
	if (!authentication.ok) {
		return authentication.status === 401
			? failure(401, "unauthorized", "Authentication failed.")
			: failure(403, "forbidden", "Mint request is not authorized.");
	}
	if (requestResult.data.purpose !== authentication.purpose) {
		return failure(403, "forbidden", "Mint request is not authorized.");
	}
	if (requestResult.data.repository !== context.config.githubRepository) {
		return failure(403, "forbidden", "Mint request is not authorized.");
	}

	const mintResult = await context.github.mintRepositoryToken({
		repository: requestResult.data.repository,
		purpose: requestResult.data.purpose,
	});
	if (!mintResult.ok) {
		return failure(502, "github-token-mint-failed", "GitHub token mint failed.");
	}

	return {
		status: 200,
		body: {
			token: mintResult.value.token,
			expiresAt: mintResult.value.expiresAt,
			repository: requestResult.data.repository,
			purpose: requestResult.data.purpose,
		},
	};
}

type AuthenticationResult =
	| { readonly ok: true; readonly purpose: MintPurpose }
	| { readonly ok: false; readonly status: 401 | 403 };

async function authenticateOidc(
	token: string | null,
	context: MintRequestContext,
): Promise<AuthenticationResult> {
	if (token === null || token.length === 0) return { ok: false, status: 401 };
	const result = await context.oidc.verifyDevelopmentIdentity({
		token,
		issuer: context.config.vercelOidcIssuer,
		audience: context.config.vercelOidcAudience,
	});
	if (!result.ok) return { ok: false, status: 401 };
	if (
		result.value.ownerId !== context.config.vercelTeamId ||
		result.value.projectId !== context.config.vercelProjectId ||
		result.value.environment !== "development"
	) {
		return { ok: false, status: 403 };
	}
	return { ok: true, purpose: "clone" };
}

function authenticateLanding(
	authorization: string | null,
	context: MintRequestContext,
): AuthenticationResult {
	if (authorization === null) return { ok: false, status: 401 };
	const match = /^Bearer ([^\s]+)$/.exec(authorization);
	if (match === null) return { ok: false, status: 401 };
	const credential = match[1];
	if (credential === undefined || !context.landingCredential.verifyLandingCredential(credential)) {
		return { ok: false, status: 401 };
	}
	return { ok: true, purpose: "landing" };
}

function failure(
	status: 400 | 401 | 403 | 500 | 502,
	code:
		| "invalid-request"
		| "unauthorized"
		| "forbidden"
		| "mint-endpoint-misconfigured"
		| "github-token-mint-failed",
	message: string,
): MintResponse {
	return { status, body: { error: { code, message } } };
}
