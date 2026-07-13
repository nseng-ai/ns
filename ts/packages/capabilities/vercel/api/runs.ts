// GET /api/runs?runId=… — the authenticated read-only run-status route: the
// local observe surface (wrapping the Workflow SDK's `getRun`) for the
// batched live pass that follows the code-first run. Same Development OIDC
// trust machinery as `/api/mint` and `/api/trigger`; live behavior on Vercel
// is pending verification.
import { handleRunStatusRequest } from "../src/trigger/handle-trigger-request.ts";
import { jsonResponse } from "../src/trigger/http.ts";
import {
	createTriggerRouteContext,
	triggerRouteConfigurationErrorResponse,
	type TriggerRouteContextOptions,
} from "../src/trigger/route-context.ts";

export type RunStatusGetHandler = (request: Request) => Promise<Response>;

export type RunStatusGetHandlerOptions = TriggerRouteContextOptions;

export function createRunStatusGetHandler(
	options: RunStatusGetHandlerOptions,
): RunStatusGetHandler {
	const contextResult = createTriggerRouteContext(options);
	if (contextResult.ok === false) {
		const { error } = contextResult;
		return async () => triggerRouteConfigurationErrorResponse(error);
	}

	const { context } = contextResult;

	return async function runStatusGetHandler(request) {
		const result = await handleRunStatusRequest(
			{
				runId: new URL(request.url).searchParams.get("runId"),
				oidcToken: request.headers.get("x-ns-dispatch-oidc-token"),
			},
			context,
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function GET(request: Request): Promise<Response> {
	return createRunStatusGetHandler({ environment: process.env })(request);
}
