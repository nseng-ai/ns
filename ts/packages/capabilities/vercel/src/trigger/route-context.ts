import {
	createDevelopmentCallerAuthenticator,
	createJoseDevelopmentCallerAuthenticator,
	type VercelOidcGateway,
} from "../auth/development-oidc.ts";
import type { TriggerRequestContext } from "./handle-trigger-request.ts";
import { jsonResponse } from "../http/http.ts";
import { httpErrorBody } from "../http/wire.ts";
import { createWorkflowSdkRunGateway } from "./real-workflow-run-gateway.ts";
import {
	parseTriggerRuntimeConfig,
	type TriggerEnvironment,
	type TriggerRuntimeConfig,
	type TriggerRuntimeConfigError,
} from "./runtime-config.ts";
import type { WorkflowRunGateway } from "./workflow-run-gateway.ts";

export interface TriggerRouteContextOptions {
	readonly environment: TriggerEnvironment;
	readonly createOidcGateway?: (config: TriggerRuntimeConfig) => VercelOidcGateway;
	readonly createWorkflowRunGateway?: (config: TriggerRuntimeConfig) => WorkflowRunGateway;
}

export type TriggerRouteConfigurationError = Pick<TriggerRuntimeConfigError, "code" | "message">;

export type TriggerRouteContextResult =
	| { readonly ok: true; readonly context: TriggerRequestContext }
	| { readonly ok: false; readonly error: TriggerRouteConfigurationError };

export function createTriggerRouteContext(
	options: TriggerRouteContextOptions,
): TriggerRouteContextResult {
	const configResult = parseTriggerRuntimeConfig(options.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (configResult.ok === false) {
		return {
			ok: false,
			error: {
				code: configResult.error.code,
				message: configResult.error.message,
			},
		};
	}

	const config = configResult.value;
	const developmentCaller =
		options.createOidcGateway === undefined
			? createJoseDevelopmentCallerAuthenticator(config)
			: createDevelopmentCallerAuthenticator(config, options.createOidcGateway(config));
	return {
		ok: true,
		context: {
			developmentCaller,
			workflowRuns: options.createWorkflowRunGateway?.(config) ?? createWorkflowSdkRunGateway(),
		},
	};
}

export function triggerRouteConfigurationErrorResponse(
	error: TriggerRouteConfigurationError,
): Response {
	return jsonResponse(httpErrorBody(error.code, error.message), 500);
}
