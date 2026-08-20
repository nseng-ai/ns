import type { NsCommandIo } from "@nseng-ai/sdk";
import type { SlotClient, SlotCheckoutFailure } from "@nseng-ai/slots/api";

import type { AutobranchProviderId } from "../autobranch/provider.ts";

import {
	createFlowAutobranchCheckpointFlow,
	type FlowAutobranchCheckpointInput,
} from "../autobranch/checkpoint-flow.ts";
import { checkoutSlot } from "./slot-checkout.ts";

export interface AutoslotFlowInput extends FlowAutobranchCheckpointInput {
	provider: AutobranchProviderId;
	slotClient: SlotClient;
	io: NsCommandIo;
}

export type AutoslotWorkflowResult =
	| {
			type: "refused";
			cwd: string;
			reason: "autobranch-refused";
			message: string;
	  }
	| {
			type: "failed";
			cwd: string;
			cause: "autobranch-failed";
			message: string;
	  }
	| {
			type: "branch-created-slot-skipped";
			cwd: string;
			branchName: string;
			warnings: string[];
			reason: "worktree-not-clean";
	  }
	| {
			type: "branch-created-slot-failed";
			cwd: string;
			branchName: string;
			warnings: string[];
			failure: SlotCheckoutFailure;
	  }
	| {
			type: "moved";
			cwd: string;
			branchName: string;
			slotName: string;
			worktreePath: string;
			warnings: string[];
			navigationCommand: string;
	  };

export async function createAutoslotFlow(
	input: AutoslotFlowInput,
): Promise<AutoslotWorkflowResult> {
	const createdBranch = await createFlowAutobranchCheckpointFlow({
		...input,
		onPhase: (message) => {
			input.io.phase(message);
		},
	});
	if (!createdBranch.ok) {
		return createdBranch.outcome === "refusal"
			? {
					type: "refused",
					cwd: input.cwd,
					reason: "autobranch-refused",
					message: createdBranch.error,
				}
			: {
					type: "failed",
					cwd: input.cwd,
					cause: "autobranch-failed",
					message: createdBranch.error,
				};
	}

	for (const warning of createdBranch.warnings) {
		input.io.notify(warning, "warning");
	}

	if (!createdBranch.isClean) {
		return {
			type: "branch-created-slot-skipped",
			cwd: input.cwd,
			branchName: createdBranch.branchName,
			warnings: createdBranch.warnings,
			reason: "worktree-not-clean",
		};
	}

	input.io.phase("Checking out branch slot…");
	const slot = await checkoutSlot(input.slotClient, { kind: "current" });
	if (!slot.ok) {
		return {
			type: "branch-created-slot-failed",
			cwd: input.cwd,
			branchName: createdBranch.branchName,
			warnings: createdBranch.warnings,
			failure: slot.failure,
		};
	}

	return {
		type: "moved",
		cwd: input.cwd,
		branchName: createdBranch.branchName,
		slotName: slot.target.slotName,
		worktreePath: slot.target.worktreePath,
		warnings: createdBranch.warnings,
		navigationCommand: `ns slot co ${slot.target.branchName}`,
	};
}
