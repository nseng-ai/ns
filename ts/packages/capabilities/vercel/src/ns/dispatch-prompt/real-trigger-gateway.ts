import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type {
	DispatchStartRunResult,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
} from "./contracts.ts";

/** The caller-owned auth header the deployable's routes verify. */
export const DISPATCH_OIDC_HEADER_NAME = "x-ns-dispatch-oidc-token";

/** Run id used by the read-only identity preflight; can never exist. */
const IDENTITY_PREFLIGHT_RUN_ID = "ns-dispatch-identity-preflight";

const triggerSuccessSchema = z.object({ runId: z.string().min(1) });
const triggerErrorSchema = z.object({
	error: z.object({ code: z.string(), message: z.string() }),
});

export function createRealDispatchTriggerGateway(
	fetchFn: typeof fetch = fetch,
): DispatchTriggerGateway {
	return {
		async checkTriggerIdentity({ deploymentUrl, oidcToken }) {
			let response: Response;
			try {
				const url = new URL("/api/runs", deploymentUrl);
				url.searchParams.set("runId", IDENTITY_PREFLIGHT_RUN_ID);
				response = await fetchFn(url, {
					method: "GET",
					headers: { [DISPATCH_OIDC_HEADER_NAME]: oidcToken },
				});
			} catch (error) {
				return { type: "unreachable", message: formatErrorMessage(error) };
			}
			return identityResultFromStatus(response.status);
		},
		async startDispatchRun({ deploymentUrl, oidcToken, input }) {
			let response: Response;
			try {
				response = await fetchFn(new URL("/api/trigger", deploymentUrl), {
					method: "POST",
					headers: {
						"content-type": "application/json",
						[DISPATCH_OIDC_HEADER_NAME]: oidcToken,
					},
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
		const parsed = triggerSuccessSchema.safeParse(payload);
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
	const parsedError = triggerErrorSchema.safeParse(payload);
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
