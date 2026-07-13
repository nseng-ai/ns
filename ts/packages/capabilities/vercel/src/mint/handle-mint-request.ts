import { mintRequestSchema, type MintErrorCode, type MintResponse } from "./contracts.ts";
import { authenticateDevelopmentCaller, type VercelOidcGateway } from "./development-oidc.ts";
import type { DispatchTokenMinter } from "./mint-core.ts";
import type { OidcTrustConfig } from "./oidc-trust-config.ts";

export interface MintRequestContext {
	readonly oidcTrust: OidcTrustConfig;
	readonly oidc: VercelOidcGateway;
	readonly minter: DispatchTokenMinter;
}

export interface MintRequestInput {
	readonly body: unknown;
	readonly oidcToken: string | null;
}

export async function handleMintRequest(
	input: MintRequestInput,
	context: MintRequestContext,
): Promise<MintResponse> {
	const requestResult = mintRequestSchema.safeParse(input.body);
	if (!requestResult.success) return failure(400, "invalid-request", "Invalid mint request.");

	const authentication = await authenticateDevelopmentCaller(
		input.oidcToken,
		context.oidcTrust,
		context.oidc,
	);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (authentication.ok === false) {
		return authentication.status === 401
			? failure(401, "unauthorized", "Authentication failed.")
			: failure(403, "forbidden", "Mint request is not authorized.");
	}
	if (requestResult.data.purpose !== "clone") {
		return failure(403, "forbidden", "Mint request is not authorized.");
	}

	const mintResult = await context.minter.mintDispatchToken({
		repository: requestResult.data.repository,
		purpose: "clone",
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

function failure(
	status: 400 | 401 | 403 | 502,
	code: MintErrorCode,
	message: string,
): MintResponse {
	return { status, body: { error: { code, message } } };
}
