import type { DispatchAnchorPr } from "./core.ts";
import { startDispatchWorkflow } from "./core.ts";
import type { DispatchClientGateways, DispatchTriggerConnection } from "./contracts.ts";
import {
	deliverPreparedDispatchInstruction,
	type DispatchInstructionDeliveryOutcome,
	type DispatchSnapshotGateway,
} from "./instruction-delivery.ts";
import { prepareDispatchInstruction } from "./instruction-preparation.ts";
import type { BrmemGateway } from "@nseng-ai/brmem";

export type DispatchAnchorToRunOutcome =
	| Exclude<DispatchInstructionDeliveryOutcome, { readonly status: "ready" }>
	| {
			readonly status: "invalid-dispatch-context";
			readonly dispatchId: string;
			readonly message: string;
	  }
	| {
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly delivery: Extract<DispatchInstructionDeliveryOutcome, { readonly status: "ready" }>;
	  }
	| {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId?: string;
			readonly delivery: Extract<DispatchInstructionDeliveryOutcome, { readonly status: "ready" }>;
	  }
	| {
			readonly status: "ready";
			readonly runId: string;
			readonly workflowRunUrl: string;
			readonly delivery: Extract<DispatchInstructionDeliveryOutcome, { readonly status: "ready" }>;
	  };

/** Shared post-anchor mechanics for every dispatch producer. */
export async function deliverInstructionsAndStartRun(options: {
	readonly cwd: string;
	readonly revision: string;
	readonly dispatchId: string;
	readonly anchorPr: DispatchAnchorPr;
	readonly instructionContent: string;
	readonly remote: string;
	readonly connection: DispatchTriggerConnection;
	readonly workflowDashboardUrl: string;
	readonly brmem: Pick<BrmemGateway, "createEntry">;
	readonly snapshots: DispatchSnapshotGateway;
	readonly workflowGateways: Pick<DispatchClientGateways, "trigger" | "anchorPrs">;
	readonly onPhase?: (message: string) => void;
}): Promise<DispatchAnchorToRunOutcome> {
	const prepared = prepareDispatchInstruction({
		dispatchId: options.dispatchId,
		anchorBranch: options.anchorPr.branch,
		content: options.instructionContent,
	});
	if (prepared.status !== "ready") return prepared;

	options.onPhase?.("Publishing the exact dispatch instructions through Branch Memory…");
	const delivery = await deliverPreparedDispatchInstruction(
		{ cwd: options.cwd },
		prepared.instruction,
		{ brmem: options.brmem, snapshots: options.snapshots },
		options.remote,
	);
	if (delivery.status !== "ready") return delivery;

	const workflow = await startDispatchWorkflow(
		{
			cwd: options.cwd,
			input: {
				revision: options.revision,
				anchorBranch: options.anchorPr.branch,
				anchorPrNumber: options.anchorPr.number,
				dispatchId: options.dispatchId,
				instructionLocator: delivery.locator,
			},
			anchorPr: options.anchorPr,
			connection: options.connection,
			workflowDashboardUrl: options.workflowDashboardUrl,
			...(options.onPhase === undefined ? {} : { onPhase: options.onPhase }),
		},
		options.workflowGateways,
	);
	if (workflow.status !== "ready") return { ...workflow, delivery };
	return {
		status: "ready",
		runId: workflow.runId,
		workflowRunUrl: workflow.workflowRunUrl,
		delivery,
	};
}
