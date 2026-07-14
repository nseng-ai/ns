// Route-agnostic handling for the workflow trigger/observe surface (the
// workflow spine probes): authenticate the Development caller with the same
// trust machinery the mint route proved, then start the requested probe
// workflow (hello or sandbox-probe) or read a run's status through the
// WorkflowRunGateway seam. Unauthenticated callers get the same safe
// 401-shaped response as `/api/mint` — no information leak.
import type { DevelopmentCallerAuthenticator } from "../auth/development-oidc.ts";
import { httpErrorBody } from "../http/wire.ts";
import {
	runIdSchema,
	triggerRequestSchema,
	type RunStatusErrorCode,
	type RunStatusResponse,
	type TriggerErrorCode,
	type TriggerRequest,
	type TriggerResponse,
} from "./contracts.ts";
import type { WorkflowRunGateway, WorkflowStartRequest } from "./workflow-run-gateway.ts";

export interface TriggerRequestContext {
	readonly developmentCaller: DevelopmentCallerAuthenticator;
	readonly workflowRuns: WorkflowRunGateway;
}

export interface TriggerRequestInput {
	readonly body: unknown;
	readonly oidcToken: string | null;
}

export async function handleTriggerRequest(
	input: TriggerRequestInput,
	context: TriggerRequestContext,
): Promise<TriggerResponse> {
	const requestResult = triggerRequestSchema.safeParse(input.body);
	if (!requestResult.success) {
		return triggerFailure(400, "invalid-request", "Invalid trigger request.");
	}

	const authentication = await context.developmentCaller.authenticate(input.oidcToken);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (authentication.ok === false) {
		return authentication.status === 401
			? triggerFailure(401, "unauthorized", "Authentication failed.")
			: triggerFailure(403, "forbidden", "Trigger request is not authorized.");
	}

	const request = requestResult.data;
	const startResult = await context.workflowRuns.startWorkflow(toWorkflowStartRequest(request));
	if (startResult.ok === false) {
		return triggerFailure(502, "workflow-start-failed", "Workflow start failed.");
	}

	return {
		status: 200,
		body: {
			runId: startResult.value.runId,
			workflow: request.workflow,
		},
	};
}

export interface RunStatusRequestInput {
	readonly runId: string | null;
	readonly oidcToken: string | null;
}

export async function handleRunStatusRequest(
	input: RunStatusRequestInput,
	context: TriggerRequestContext,
): Promise<RunStatusResponse> {
	const runIdResult = runIdSchema.safeParse(input.runId);
	if (!runIdResult.success) {
		return runStatusFailure(400, "invalid-request", "Invalid run-status request.");
	}

	const authentication = await context.developmentCaller.authenticate(input.oidcToken);
	if (authentication.ok === false) {
		return authentication.status === 401
			? runStatusFailure(401, "unauthorized", "Authentication failed.")
			: runStatusFailure(403, "forbidden", "Run-status request is not authorized.");
	}

	const statusResult = await context.workflowRuns.readWorkflowRunStatus({
		runId: runIdResult.data,
	});
	if (statusResult.type === "missing") {
		return runStatusFailure(404, "run-not-found", "Run not found.");
	}
	if (statusResult.type === "error") {
		return runStatusFailure(502, "run-status-read-failed", "Run status read failed.");
	}

	return {
		status: 200,
		body: { runId: runIdResult.data, status: statusResult.value.status },
	};
}

function toWorkflowStartRequest(request: TriggerRequest): WorkflowStartRequest {
	switch (request.workflow) {
		case "hello":
			return { workflow: "hello", input: { name: request.name } };
		case "sandbox-probe":
			return { workflow: "sandbox-probe", input: { revision: request.revision } };
		case "supervision-probe":
			return {
				workflow: "supervision-probe",
				input: {
					runSeconds: request.runSeconds,
					pollSeconds: request.pollSeconds,
				},
			};
		case "dispatch":
			return {
				workflow: "dispatch",
				input: {
					revision: request.revision,
					anchorBranch: request.anchorBranch,
					anchorPrNumber: request.anchorPrNumber,
					prompt: request.prompt,
				},
			};
	}
}

function triggerFailure(
	status: 400 | 401 | 403 | 502,
	code: TriggerErrorCode,
	message: string,
): TriggerResponse {
	return { status, body: httpErrorBody(code, message) };
}

function runStatusFailure(
	status: 400 | 401 | 403 | 404 | 502,
	code: RunStatusErrorCode,
	message: string,
): RunStatusResponse {
	return { status, body: httpErrorBody(code, message) };
}
