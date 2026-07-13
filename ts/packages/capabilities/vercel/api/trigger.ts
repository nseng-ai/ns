// POST /api/trigger — the authenticated workflow trigger route (probe-1,
// workflow-hello-probe). A Development Vercel OIDC token on the
// dispatch-owned `x-ns-dispatch-oidc-token` header starts the hello workflow
// through the Workflow SDK's `start()` and returns the run id. Live
// trigger behavior on Vercel is pending verification.
import type { VercelOidcGateway } from "../src/mint/development-oidc.ts";
import { createJoseVercelOidcGateway } from "../src/mint/real-gateways.ts";
import { handleTriggerRequest } from "../src/trigger/handle-trigger-request.ts";
import { jsonResponse, readJsonBody } from "../src/trigger/http.ts";
import { createWorkflowSdkRunGateway } from "../src/trigger/real-workflow-run-gateway.ts";
import {
	parseTriggerRuntimeConfig,
	type TriggerEnvironment,
	type TriggerRuntimeConfig,
} from "../src/trigger/runtime-config.ts";
import type { WorkflowRunGateway } from "../src/trigger/workflow-run-gateway.ts";

export type TriggerPostHandler = (request: Request) => Promise<Response>;

export interface TriggerPostHandlerOptions {
	readonly environment: TriggerEnvironment;
	readonly createOidcGateway?: (config: TriggerRuntimeConfig) => VercelOidcGateway;
	readonly createWorkflowRunGateway?: (config: TriggerRuntimeConfig) => WorkflowRunGateway;
}

export function createTriggerPostHandler(options: TriggerPostHandlerOptions): TriggerPostHandler {
	const configResult = parseTriggerRuntimeConfig(options.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (configResult.ok === false) {
		const { error } = configResult;
		return async () =>
			jsonResponse(
				{
					error: {
						code: error.code,
						message: error.message,
					},
				},
				500,
			);
	}

	const config = configResult.value;
	const oidc = options.createOidcGateway?.(config) ?? createJoseVercelOidcGateway();
	const workflowRuns = options.createWorkflowRunGateway?.(config) ?? createWorkflowSdkRunGateway();

	return async function triggerPostHandler(request) {
		const bodyResult = await readJsonBody(request);
		if (!bodyResult.ok) {
			return jsonResponse(
				{ error: { code: "invalid-request", message: "Invalid trigger request." } },
				400,
			);
		}

		const result = await handleTriggerRequest(
			{
				body: bodyResult.value,
				oidcToken: request.headers.get("x-ns-dispatch-oidc-token"),
			},
			{ config, oidc, workflowRuns },
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function POST(request: Request): Promise<Response> {
	return createTriggerPostHandler({ environment: process.env })(request);
}
