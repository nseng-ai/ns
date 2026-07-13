// Gateway seam over the Workflow SDK's run surface (`start`, `getRun`) so the
// trigger/observe route handlers and their tests run against in-memory fakes
// with no network. Vercel vocabulary is deliberate (no backend-agnostic
// executor contract); vendor types stay inside the real adapter.
import type { DispatchRunInput } from "../dispatch/dispatch-run.ts";
import type { SupervisionProbeParams } from "../sandbox/supervision-probe.ts";
import type { WorkflowRunStatus } from "./contracts.ts";

export interface StartedWorkflowRun {
	readonly runId: string;
}

export type StartWorkflowRunResult =
	| { readonly ok: true; readonly value: StartedWorkflowRun }
	| { readonly ok: false };

export type ReadWorkflowRunStatusResult =
	| { readonly type: "found"; readonly value: { readonly status: WorkflowRunStatus } }
	| { readonly type: "missing" }
	| { readonly type: "error" };

export type WorkflowStartRequest =
	| { readonly workflow: "hello"; readonly input: { readonly name: string } }
	| {
			readonly workflow: "sandbox-probe";
			readonly input: { readonly revision: string };
	  }
	| { readonly workflow: "supervision-probe"; readonly input: SupervisionProbeParams }
	| { readonly workflow: "dispatch"; readonly input: DispatchRunInput };

export interface WorkflowRunGateway {
	startWorkflow(request: WorkflowStartRequest): Promise<StartWorkflowRunResult>;
	readWorkflowRunStatus(options: { readonly runId: string }): Promise<ReadWorkflowRunStatusResult>;
}
