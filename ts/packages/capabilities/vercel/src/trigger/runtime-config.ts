import { z } from "zod";

export interface TriggerRuntimeConfig {
	readonly vercelTeamId: string;
	readonly vercelProjectId: string;
	readonly vercelOidcIssuer: string;
	readonly vercelOidcAudience: string;
}

export interface TriggerRuntimeConfigError {
	readonly code: "trigger-endpoint-misconfigured";
	readonly message: string;
	readonly variable: string;
}

export type TriggerRuntimeConfigParseResult =
	| { readonly ok: true; readonly value: TriggerRuntimeConfig }
	| { readonly ok: false; readonly error: TriggerRuntimeConfigError };

export type TriggerEnvironment = Readonly<Record<string, string | undefined>>;

const runtimeEnvironmentSchema = z.strictObject({
	NS_DISPATCH_VERCEL_TEAM_ID: z.string().regex(/^team_[A-Za-z0-9]+$/),
	NS_DISPATCH_VERCEL_PROJECT_ID: z.string().regex(/^prj_[A-Za-z0-9]+$/),
	NS_DISPATCH_VERCEL_OIDC_ISSUER: z.url(),
	NS_DISPATCH_VERCEL_OIDC_AUDIENCE: z.url(),
});

const runtimeEnvironmentNames = [
	"NS_DISPATCH_VERCEL_TEAM_ID",
	"NS_DISPATCH_VERCEL_PROJECT_ID",
	"NS_DISPATCH_VERCEL_OIDC_ISSUER",
	"NS_DISPATCH_VERCEL_OIDC_AUDIENCE",
] as const;

export function parseTriggerRuntimeConfig(
	environment: TriggerEnvironment,
): TriggerRuntimeConfigParseResult {
	const rawEnvironment = {
		NS_DISPATCH_VERCEL_TEAM_ID: environment.NS_DISPATCH_VERCEL_TEAM_ID,
		NS_DISPATCH_VERCEL_PROJECT_ID: environment.NS_DISPATCH_VERCEL_PROJECT_ID,
		NS_DISPATCH_VERCEL_OIDC_ISSUER: environment.NS_DISPATCH_VERCEL_OIDC_ISSUER,
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: environment.NS_DISPATCH_VERCEL_OIDC_AUDIENCE,
	};
	const result = runtimeEnvironmentSchema.safeParse(rawEnvironment);
	if (!result.success) {
		const issuePath = result.error.issues[0]?.path[0];
		const variable = isRuntimeEnvironmentName(issuePath)
			? issuePath
			: "trigger endpoint environment";
		return {
			ok: false,
			error: {
				code: "trigger-endpoint-misconfigured",
				message: `Trigger endpoint configuration is invalid: ${variable}.`,
				variable,
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

function isRuntimeEnvironmentName(
	value: PropertyKey | undefined,
): value is (typeof runtimeEnvironmentNames)[number] {
	return typeof value === "string" && runtimeEnvironmentNames.some((name) => name === value);
}
