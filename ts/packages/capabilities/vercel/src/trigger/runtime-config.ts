import {
	parseOidcTrustConfig,
	type OidcTrustConfig,
	type OidcTrustEnvironment,
} from "../auth/oidc-trust-config.ts";

export type TriggerRuntimeConfig = OidcTrustConfig;

export interface TriggerRuntimeConfigError {
	readonly code: "trigger-endpoint-misconfigured";
	readonly message: string;
	readonly variable: string;
}

export type TriggerRuntimeConfigParseResult =
	| { readonly ok: true; readonly value: TriggerRuntimeConfig }
	| { readonly ok: false; readonly error: TriggerRuntimeConfigError };

export type TriggerEnvironment = OidcTrustEnvironment;

export function parseTriggerRuntimeConfig(
	environment: TriggerEnvironment,
): TriggerRuntimeConfigParseResult {
	const result = parseOidcTrustConfig(environment);
	if (result.ok === false) {
		const variable = result.error.variable;
		return {
			ok: false,
			error: {
				code: "trigger-endpoint-misconfigured",
				message: `Trigger endpoint configuration is invalid: ${variable}.`,
				variable,
			},
		};
	}
	return result;
}
