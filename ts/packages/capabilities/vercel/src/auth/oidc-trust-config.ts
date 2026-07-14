import { z } from "zod";

import { vercelProjectIdSchema, vercelTeamIdSchema } from "./contracts.ts";

export interface OidcTrustConfig {
	readonly vercelTeamId: string;
	readonly vercelProjectId: string;
	readonly vercelOidcIssuer: string;
	readonly vercelOidcAudience: string;
}

export interface OidcTrustConfigError {
	readonly variable: string;
}

export type OidcTrustConfigParseResult =
	| { readonly ok: true; readonly value: OidcTrustConfig }
	| { readonly ok: false; readonly error: OidcTrustConfigError };

export type OidcTrustEnvironment = Readonly<Record<string, string | undefined>>;

const oidcTrustEnvironmentSchema = z.strictObject({
	NS_DISPATCH_VERCEL_TEAM_ID: vercelTeamIdSchema,
	NS_DISPATCH_VERCEL_PROJECT_ID: vercelProjectIdSchema,
	NS_DISPATCH_VERCEL_OIDC_ISSUER: z.url(),
	NS_DISPATCH_VERCEL_OIDC_AUDIENCE: z.url(),
});

const oidcTrustEnvironmentNames = [
	"NS_DISPATCH_VERCEL_TEAM_ID",
	"NS_DISPATCH_VERCEL_PROJECT_ID",
	"NS_DISPATCH_VERCEL_OIDC_ISSUER",
	"NS_DISPATCH_VERCEL_OIDC_AUDIENCE",
] as const;

type OidcTrustEnvironmentName = (typeof oidcTrustEnvironmentNames)[number];

export function parseOidcTrustConfig(
	environment: OidcTrustEnvironment,
): OidcTrustConfigParseResult {
	const result = oidcTrustEnvironmentSchema.safeParse({
		NS_DISPATCH_VERCEL_TEAM_ID: environment.NS_DISPATCH_VERCEL_TEAM_ID,
		NS_DISPATCH_VERCEL_PROJECT_ID: environment.NS_DISPATCH_VERCEL_PROJECT_ID,
		NS_DISPATCH_VERCEL_OIDC_ISSUER: environment.NS_DISPATCH_VERCEL_OIDC_ISSUER,
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: environment.NS_DISPATCH_VERCEL_OIDC_AUDIENCE,
	});
	if (!result.success) {
		const issuePath = result.error.issues[0]?.path[0];
		return {
			ok: false,
			error: {
				variable: isOidcTrustEnvironmentName(issuePath) ? issuePath : "OIDC trust environment",
			},
		};
	}

	return {
		ok: true,
		value: {
			vercelTeamId: result.data.NS_DISPATCH_VERCEL_TEAM_ID,
			vercelProjectId: result.data.NS_DISPATCH_VERCEL_PROJECT_ID,
			vercelOidcIssuer: result.data.NS_DISPATCH_VERCEL_OIDC_ISSUER,
			vercelOidcAudience: result.data.NS_DISPATCH_VERCEL_OIDC_AUDIENCE,
		},
	};
}

function isOidcTrustEnvironmentName(
	value: PropertyKey | undefined,
): value is OidcTrustEnvironmentName {
	return typeof value === "string" && oidcTrustEnvironmentNames.some((name) => name === value);
}
