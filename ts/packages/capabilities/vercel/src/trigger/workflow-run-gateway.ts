// Gateway seam over the Workflow SDK's run surface (`start`, `getRun`) so the
// trigger/observe route handlers and their tests run against in-memory fakes
// with no network. Vercel vocabulary is deliberate (no backend-agnostic
// executor contract); vendor types stay inside the real adapter.
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

export interface WorkflowRunGateway {
	startHelloWorkflow(options: { readonly name: string }): Promise<StartWorkflowRunResult>;
	startSandboxProbeWorkflow(options: {
		readonly revision: string;
	}): Promise<StartWorkflowRunResult>;
	startSupervisionProbeWorkflow(options: {
		readonly runSeconds: number;
		readonly pollSeconds: number;
	}): Promise<StartWorkflowRunResult>;
	readWorkflowRunStatus(options: { readonly runId: string }): Promise<ReadWorkflowRunStatusResult>;
}
