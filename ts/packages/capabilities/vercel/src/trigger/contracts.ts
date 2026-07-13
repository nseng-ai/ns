// Wire contracts for the workflow trigger/observe routes (probe-1,
// workflow-hello-probe): start a deployed workflow through the authenticated
// trigger route and read a run's status back by run id. Responses carry
// stable codes only; nothing here has been live-verified on Vercel yet.
import { z } from "zod";

import {
	SUPERVISION_POLL_SECONDS_MAX,
	SUPERVISION_POLL_SECONDS_MIN,
	SUPERVISION_RUN_SECONDS_MAX,
	SUPERVISION_RUN_SECONDS_MIN,
} from "../sandbox/supervision-probe.ts";

export const triggerWorkflowValues = ["hello", "sandbox-probe", "supervision-probe"] as const;

export type TriggerWorkflowName = (typeof triggerWorkflowValues)[number];

const commitShaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/);

export const triggerRequestSchema = z.discriminatedUnion("workflow", [
	z.strictObject({
		workflow: z.literal("hello"),
		name: z.string().min(1).max(200),
	}),
	// Probe-2: the sandbox-in-workflow probe takes only the exact commit SHA
	// to check out; the repository is the deployable's configured exact
	// repository, never caller input.
	z.strictObject({
		workflow: z.literal("sandbox-probe"),
		revision: commitShaSchema,
	}),
	// Probe-3: the long-run supervision probe takes the detached run's length
	// and the supervision poll cadence, both bounded, so quick smoke runs and
	// the >13-minute live supervision proof share this code.
	z.strictObject({
		workflow: z.literal("supervision-probe"),
		runSeconds: z.number().int().min(SUPERVISION_RUN_SECONDS_MIN).max(SUPERVISION_RUN_SECONDS_MAX),
		pollSeconds: z
			.number()
			.int()
			.min(SUPERVISION_POLL_SECONDS_MIN)
			.max(SUPERVISION_POLL_SECONDS_MAX),
	}),
]);

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
