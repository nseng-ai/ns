// The real Workflow SDK adapter behind WorkflowRunGateway. `start()` resolves
// the workflow through a transform-injected `workflowId`, which the trigger
// route's Node-builder bundle never receives, so this adapter passes the
// manifest-derived metadata id explicitly (see `workflow-ids.ts`; the
// `build:deployable` gate verifies the ids
// against the emitted manifest).
// Live start/getRun behavior on Vercel is pending verification. `sdk` is the
// test seam; production callers use the default binding.
import { getRun, start } from "workflow/api";
import { WorkflowRunNotFoundError } from "workflow/errors";
import { z } from "zod";

import { workflowRunStatusValues } from "./contracts.ts";
import { triggerWorkflowIds } from "./workflow-ids.ts";
import type { StartWorkflowRunResult, WorkflowRunGateway } from "./workflow-run-gateway.ts";

export interface WorkflowRunSdk {
	start(
		workflow: { readonly workflowId: string },
		args: readonly unknown[],
	): Promise<{ readonly runId: string }>;
	getRun(runId: string): { readonly status: Promise<string> };
}

const runStatusSchema = z.enum(workflowRunStatusValues);

export function createWorkflowSdkRunGateway(
	sdk: WorkflowRunSdk = defaultWorkflowRunSdk(),
): WorkflowRunGateway {
	async function startWorkflowRun(
		workflowId: string,
		args: readonly unknown[],
	): Promise<StartWorkflowRunResult> {
		try {
			const run = await sdk.start({ workflowId }, args);
			if (run.runId.length === 0) return { ok: false };
			return { ok: true, value: { runId: run.runId } };
		} catch {
			return { ok: false };
		}
	}

	return {
		async startWorkflow(request) {
			switch (request.workflow) {
				case "hello":
					return await startWorkflowRun(triggerWorkflowIds.hello, [request.input.name]);
				case "sandbox-probe":
					return await startWorkflowRun(triggerWorkflowIds["sandbox-probe"], [
						request.input.revision,
					]);
				case "supervision-probe":
					return await startWorkflowRun(triggerWorkflowIds["supervision-probe"], [request.input]);
				case "dispatch":
					return await startWorkflowRun(triggerWorkflowIds.dispatch, [request.input]);
			}
		},
		async readWorkflowRunStatus(options) {
			try {
				const status = await sdk.getRun(options.runId).status;
				const parsed = runStatusSchema.safeParse(status);
				if (!parsed.success) return { type: "error" };
				return { type: "found", value: { status: parsed.data } };
			} catch (error) {
				if (WorkflowRunNotFoundError.is(error)) return { type: "missing" };
				return { type: "error" };
			}
		},
	};
}

function defaultWorkflowRunSdk(): WorkflowRunSdk {
	return {
		async start(workflow, args) {
			return await start(workflow, [...args]);
		},
		getRun(runId) {
			return getRun(runId);
		},
	};
}
