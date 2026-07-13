import { mintRequestSchema, type MintPurpose, type MintResponse } from "./contracts.ts";
import { authenticateDevelopmentCaller, type VercelOidcGateway } from "./development-oidc.ts";
import type { DispatchTokenMinter } from "./mint-core.ts";
import type { MintRuntimeConfig } from "./runtime-config.ts";

export interface LandingCredentialGateway {
	verifyLandingCredential(credential: string): boolean;
}

export interface MintRequestContext {
	readonly config: MintRuntimeConfig;
	readonly oidc: VercelOidcGateway;
	readonly landingCredential: LandingCredentialGateway;
	readonly minter: DispatchTokenMinter;
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
	if (authentication.ok === false) {
		return authentication.status === 401
			? failure(401, "unauthorized", "Authentication failed.")
			: failure(403, "forbidden", "Mint request is not authorized.");
	}
	if (requestResult.data.purpose !== authentication.purpose) {
		return failure(403, "forbidden", "Mint request is not authorized.");
	}

	const mintResult = await context.minter.mintDispatchToken({
		repository: requestResult.data.repository,
		purpose: requestResult.data.purpose,
	});
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (mintResult.ok === false) {
		return mintResult.error.code === "repository-not-allowed"
			? failure(403, "forbidden", "Mint request is not authorized.")
			: failure(502, "github-token-mint-failed", "GitHub token mint failed.");
	}

	return {
		status: 200,
		body: {
			token: mintResult.value.token,
			expiresAt: mintResult.value.expiresAt,
			repository: mintResult.value.repository,
			purpose: mintResult.value.purpose,
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
	const result = await authenticateDevelopmentCaller(
		token,
		{
			issuer: context.config.vercelOidcIssuer,
			audience: context.config.vercelOidcAudience,
			teamId: context.config.vercelTeamId,
			projectId: context.config.vercelProjectId,
		},
		context.oidc,
	);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (result.ok === false) return result;
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
