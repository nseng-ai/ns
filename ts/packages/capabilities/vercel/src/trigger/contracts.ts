// Wire contracts for the workflow trigger/observe routes (probe-1,
// workflow-hello-probe): start a deployed workflow through the authenticated
// trigger route and read a run's status back by run id. Responses carry
// stable codes only; nothing here has been live-verified on Vercel yet.
import { z } from "zod";

import {
	DISPATCH_ANCHOR_BRANCH_MAX_CHARS,
	DISPATCH_ANCHOR_PR_NUMBER_MAX,
	DISPATCH_PROMPT_MAX_CHARS,
	isValidDispatchAnchorBranch,
} from "../dispatch/dispatch-run.ts";
import { DISPATCH_RUN_ID_MAX_CHARS } from "../dispatch/validation.ts";
import { COMMIT_SHA_PATTERN } from "../sandbox/validation.ts";
import {
	SUPERVISION_POLL_SECONDS_MAX,
	SUPERVISION_POLL_SECONDS_MIN,
	SUPERVISION_RUN_SECONDS_MAX,
	SUPERVISION_RUN_SECONDS_MIN,
} from "../sandbox/supervision-probe.ts";

export const triggerWorkflowValues = [
	"hello",
	"sandbox-probe",
	"supervision-probe",
	"dispatch",
] as const;

export type TriggerWorkflowName = (typeof triggerWorkflowValues)[number];

const commitShaSchema = z.string().regex(COMMIT_SHA_PATTERN);

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
	// The dispatch workflow's run-input contract (steel thread): the exact
	// dispatched SHA, the `dispatch/`-prefixed anchor branch, the anchor PR
	// opened up front by the CLI, and the prompt/work reference. The
	// repository, harness invocation, and credentials are deployable-side
	// configuration, never caller input. The workflow re-validates the same
	// bounds with plain checks.
	z.strictObject({
		workflow: z.literal("dispatch"),
		revision: commitShaSchema,
		anchorBranch: z
			.string()
			.min(1)
			.max(DISPATCH_ANCHOR_BRANCH_MAX_CHARS)
			.refine(isValidDispatchAnchorBranch),
		anchorPrNumber: z.number().int().min(1).max(DISPATCH_ANCHOR_PR_NUMBER_MAX),
		prompt: z.string().min(1).max(DISPATCH_PROMPT_MAX_CHARS),
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

export const runIdSchema = z.string().min(1).max(DISPATCH_RUN_ID_MAX_CHARS);

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
