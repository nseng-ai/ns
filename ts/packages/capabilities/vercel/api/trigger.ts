// POST /api/trigger — the authenticated workflow trigger route (probe-1,
// workflow-hello-probe). A Development Vercel OIDC token on the
// dispatch-owned `x-ns-dispatch-oidc-token` header starts the hello workflow
// through the Workflow SDK's `start()` and returns the run id. Live
// trigger behavior on Vercel is pending verification.
import { handleTriggerRequest } from "../src/trigger/handle-trigger-request.ts";
import { jsonResponse, readJsonBody } from "../src/trigger/http.ts";
import {
	createTriggerRouteContext,
	triggerRouteConfigurationErrorResponse,
	type TriggerRouteContextOptions,
} from "../src/trigger/route-context.ts";

export type TriggerPostHandler = (request: Request) => Promise<Response>;

export type TriggerPostHandlerOptions = TriggerRouteContextOptions;

export function createTriggerPostHandler(options: TriggerPostHandlerOptions): TriggerPostHandler {
	const contextResult = createTriggerRouteContext(options);
	if (contextResult.ok === false) {
		const { error } = contextResult;
		return async () => triggerRouteConfigurationErrorResponse(error);
	}

	const { context } = contextResult;

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
			context,
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function POST(request: Request): Promise<Response> {
	return createTriggerPostHandler({ environment: process.env })(request);
}
