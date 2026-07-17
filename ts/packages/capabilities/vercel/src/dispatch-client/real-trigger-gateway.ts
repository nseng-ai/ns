import { formatErrorMessage, optionalEntries } from "@nseng-ai/foundation/primitives";
import {
	DISPATCH_OIDC_HEADER_NAME,
	httpErrorSchema,
	RUNS_ROUTE_PATH,
	TRIGGER_ROUTE_PATH,
	triggerSuccessResponseSchema,
} from "../http/wire.ts";
import type {
	DispatchStartRunResult,
	DispatchTriggerConnection,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
} from "../dispatch-client/contracts.ts";

/** Valid-shaped run id used by the read-only identity preflight; can never exist. */
const IDENTITY_PREFLIGHT_RUN_ID = "wrun_00000000000000000000000000";

export function createRealDispatchTriggerGateway(
	fetchFn: typeof fetch = fetch,
): DispatchTriggerGateway {
	return {
		async checkTriggerIdentity({ connection }) {
			let response: Response;
			try {
				const url = new URL(RUNS_ROUTE_PATH, connection.deploymentUrl);
				url.searchParams.set("runId", IDENTITY_PREFLIGHT_RUN_ID);
				response = await fetchFn(url, {
					method: "GET",
					headers: dispatchHeaders(connection),
				});
			} catch (error) {
				return { type: "unreachable", message: formatErrorMessage(error) };
			}
			return identityResultFromStatus(response.status);
		},
		async startDispatchRun({ connection, input }) {
			let response: Response;
			try {
				response = await fetchFn(new URL(TRIGGER_ROUTE_PATH, connection.deploymentUrl), {
					method: "POST",
					headers: { "content-type": "application/json", ...dispatchHeaders(connection) },
					body: JSON.stringify({ workflow: "dispatch", ...input }),
				});
			} catch (error) {
				return {
					ok: false,
					error: { code: "unreachable", message: formatErrorMessage(error) },
				};
			}
			return await startRunResultFromResponse(response);
		},
	};
}

function dispatchHeaders(connection: DispatchTriggerConnection): Record<string, string> {
	return {
		[DISPATCH_OIDC_HEADER_NAME]: connection.oidcToken,
		...optionalEntries({ "x-vercel-protection-bypass": connection.protectionBypass }),
	};
}

function identityResultFromStatus(status: number): DispatchTriggerIdentityResult {
	// 404 run-not-found is this preflight's success signal: the route is
	// reachable and the caller's identity was accepted before the lookup.
	if (status === 404) return { type: "authorized" };
	if (status === 401) return { type: "unauthorized" };
	if (status === 403) return { type: "forbidden" };
	if (status === 500) return { type: "endpoint-misconfigured" };
	return { type: "unexpected-response", status };
}

async function startRunResultFromResponse(response: Response): Promise<DispatchStartRunResult> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	if (response.status === 200) {
		const parsed = triggerSuccessResponseSchema.safeParse(payload);
		if (!parsed.success) {
			return {
				ok: false,
				error: {
					code: "unexpected-response",
					message: "The trigger route answered 200 without a run id.",
				},
			};
		}
		return { ok: true, value: { runId: parsed.data.runId } };
	}
	const parsedError = httpErrorSchema.safeParse(payload);
	const remoteMessage = parsedError.success
		? `${parsedError.data.error.code}: ${parsedError.data.error.message}`
		: `status ${response.status}`;
	return {
		ok: false,
		error: {
			code: startRunErrorCodeFromStatus(response.status),
			message: `The trigger route refused the dispatch (${remoteMessage}).`,
		},
	};
}

function startRunErrorCodeFromStatus(
	status: number,
): Extract<DispatchStartRunResult, { ok: false }>["error"]["code"] {
	if (status === 400) return "invalid-request";
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 500) return "endpoint-misconfigured";
	if (status === 502) return "workflow-start-failed";
	return "unexpected-response";
}
