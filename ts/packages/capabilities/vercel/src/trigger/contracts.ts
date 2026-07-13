// Wire contracts for the workflow trigger/observe routes (probe-1,
// workflow-hello-probe): start a deployed workflow through the authenticated
// trigger route and read a run's status back by run id. Responses carry
// stable codes only; nothing here has been live-verified on Vercel yet.
import { z } from "zod";

export const triggerWorkflowValues = ["hello"] as const;

export type TriggerWorkflowName = (typeof triggerWorkflowValues)[number];

export const triggerRequestSchema = z.strictObject({
	workflow: z.enum(triggerWorkflowValues),
	name: z.string().min(1).max(200),
});

export type TriggerRequest = z.infer<typeof triggerRequestSchema>;

export interface TriggerSuccess {
	readonly runId: string;
	readonly workflow: TriggerWorkflowName;
}

export type TriggerErrorCode =
	| "invalid-request"
	| "unauthorized"
	| "forbidden"
	| "trigger-endpoint-misconfigured"
	| "workflow-start-failed";

export interface TriggerError {
	readonly code: TriggerErrorCode;
	readonly message: string;
}

export type TriggerResponse =
	| { readonly status: 200; readonly body: TriggerSuccess }
	| {
			readonly status: 400 | 401 | 403 | 500 | 502;
			readonly body: { readonly error: TriggerError };
	  };

export const workflowRunStatusValues = [
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatusValues)[number];

export const runIdSchema = z.string().min(1).max(256);

export interface RunStatusSuccess {
	readonly runId: string;
	readonly status: WorkflowRunStatus;
}

export type RunStatusErrorCode =
	| "invalid-request"
	| "unauthorized"
	| "forbidden"
	| "trigger-endpoint-misconfigured"
	| "run-not-found"
	| "run-status-read-failed";

export interface RunStatusError {
	readonly code: RunStatusErrorCode;
	readonly message: string;
}

export type RunStatusResponse =
	| { readonly status: 200; readonly body: RunStatusSuccess }
	| {
			readonly status: 400 | 401 | 403 | 404 | 500 | 502;
			readonly body: { readonly error: RunStatusError };
	  };
