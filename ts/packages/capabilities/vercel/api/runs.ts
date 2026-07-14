// GET /api/runs?runId=… — the authenticated read-only run-status route: the
// local observe surface (wrapping the Workflow SDK's `getRun`) for the
// batched live pass that follows the code-first run. Same Development OIDC
// trust machinery as `/api/mint` and `/api/trigger`; live behavior on Vercel
// is pending verification.
import type { VercelOidcGateway } from "../src/mint/development-oidc.ts";
import { createJoseVercelOidcGateway } from "../src/mint/real-gateways.ts";
import { handleRunStatusRequest } from "../src/trigger/handle-trigger-request.ts";
import { jsonResponse } from "../src/trigger/http.ts";
import { createWorkflowSdkRunGateway } from "../src/trigger/real-workflow-run-gateway.ts";
import {
	parseTriggerRuntimeConfig,
	type TriggerEnvironment,
	type TriggerRuntimeConfig,
} from "../src/trigger/runtime-config.ts";
import type { WorkflowRunGateway } from "../src/trigger/workflow-run-gateway.ts";

export type RunStatusGetHandler = (request: Request) => Promise<Response>;

export interface RunStatusGetHandlerOptions {
	readonly environment: TriggerEnvironment;
	readonly createOidcGateway?: (config: TriggerRuntimeConfig) => VercelOidcGateway;
	readonly createWorkflowRunGateway?: (config: TriggerRuntimeConfig) => WorkflowRunGateway;
}

export function createRunStatusGetHandler(
	options: RunStatusGetHandlerOptions,
): RunStatusGetHandler {
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

	return async function runStatusGetHandler(request) {
		const result = await handleRunStatusRequest(
			{
				runId: new URL(request.url).searchParams.get("runId"),
				oidcToken: request.headers.get("x-ns-dispatch-oidc-token"),
			},
			{ config, oidc, workflowRuns },
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function GET(request: Request): Promise<Response> {
	return createRunStatusGetHandler({ environment: process.env })(request);
}
