// Development-caller authentication for the deployable's authenticated routes.
// The complete trust policy is captured when the authenticator is constructed,
// so request handling supplies only the caller token.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import type { OidcTrustConfig } from "./oidc-trust-config.ts";

export interface VercelOidcIdentity {
	readonly ownerId: string;
	readonly projectId: string;
	readonly environment: string;
}

export type VercelOidcVerificationResult =
	| { readonly ok: true; readonly value: VercelOidcIdentity }
	| { readonly ok: false };

export interface VercelOidcGateway {
	verifyDevelopmentIdentity(token: string): Promise<VercelOidcVerificationResult>;
}

export type DevelopmentCallerAuthentication =
	| { readonly ok: true }
	| { readonly ok: false; readonly status: 401 | 403 };

export interface DevelopmentCallerAuthenticator {
	authenticate(token: string | null): Promise<DevelopmentCallerAuthentication>;
}

export interface JoseVercelOidcGatewayOptions {
	readonly keyResolver?: JWTVerifyGetKey;
}

const vercelOidcClaimsSchema = z.object({
	owner_id: z.string().min(1),
	project_id: z.string().min(1),
	environment: z.string().min(1),
	exp: z.number().int().positive(),
});

export function createJoseVercelOidcGateway(
	trust: OidcTrustConfig,
	options: JoseVercelOidcGatewayOptions = {},
): VercelOidcGateway {
	const issuer = trust.vercelOidcIssuer;
	const audience = trust.vercelOidcAudience;
	const keyResolver =
		options.keyResolver ??
		createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks`));
	return {
		async verifyDevelopmentIdentity(token) {
			try {
				const verification = await jwtVerify(token, keyResolver, { issuer, audience });
				const claims = vercelOidcClaimsSchema.safeParse(verification.payload);
				if (!claims.success) return { ok: false };
				return {
					ok: true,
					value: {
						ownerId: claims.data.owner_id,
						projectId: claims.data.project_id,
						environment: claims.data.environment,
					},
				};
			} catch {
				return { ok: false };
			}
		},
	};
}

export function createDevelopmentCallerAuthenticator(
	trust: OidcTrustConfig,
	oidc: VercelOidcGateway,
): DevelopmentCallerAuthenticator {
	const teamId = trust.vercelTeamId;
	const projectId = trust.vercelProjectId;
	return {
		async authenticate(token) {
			if (token === null || token.length === 0) return { ok: false, status: 401 };
			const result = await oidc.verifyDevelopmentIdentity(token);
			if (result.ok === false) return { ok: false, status: 401 };
			if (
				result.value.ownerId !== teamId ||
				result.value.projectId !== projectId ||
				result.value.environment !== "development"
			) {
				return { ok: false, status: 403 };
			}
			return { ok: true };
		},
	};
}

export function createJoseDevelopmentCallerAuthenticator(
	trust: OidcTrustConfig,
	options: JoseVercelOidcGatewayOptions = {},
): DevelopmentCallerAuthenticator {
	return createDevelopmentCallerAuthenticator(trust, createJoseVercelOidcGateway(trust, options));
}
