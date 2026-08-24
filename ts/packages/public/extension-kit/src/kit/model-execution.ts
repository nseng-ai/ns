import { formatModelRef, type ModelSelection } from "@nseng-ai/foundation/model-slug";

import type {
	ModelOperationId,
	ModelOperationSource,
	ModelProfileName,
	ModelProfileSource,
	ResolvedModelOperation,
} from "./model-policy.ts";

export interface ModelExecutionSelection {
	readonly modelSelection: ModelSelection;
	readonly provenance:
		| {
				readonly type: "model-policy";
				readonly operationId: ModelOperationId;
				readonly profile: ModelProfileName;
				readonly profileSource: ModelProfileSource;
				readonly operationSource: ModelOperationSource;
		  }
		| { readonly type: "explicit" };
}

export interface ModelExecutionCoordinator {
	beforeExecution(selection: ModelExecutionSelection): void;
}

/** Preserves model-policy provenance through execution dispatch. */
export function modelExecutionSelectionFromResolvedOperation(
	resolved: ResolvedModelOperation,
): ModelExecutionSelection {
	return {
		modelSelection: resolved.selection,
		provenance: {
			type: "model-policy",
			operationId: resolved.operationId,
			profile: resolved.profile,
			profileSource: resolved.profileSource,
			operationSource: resolved.operationSource,
		},
	};
}

/** Marks a direct model override so it cannot be mistaken for a policy fallback. */
export function createExplicitModelExecutionSelection(
	modelSelection: ModelSelection,
): ModelExecutionSelection {
	return { modelSelection, provenance: { type: "explicit" } };
}

/** Coordinates fallback presentation for one command or action invocation. */
export function createModelExecutionCoordinator(options: {
	readonly warn: (message: string) => void;
}): ModelExecutionCoordinator {
	let warningEmitted = false;
	return {
		beforeExecution(selection) {
			if (
				warningEmitted ||
				selection.provenance.type !== "model-policy" ||
				selection.provenance.profileSource !== "built-in"
			) {
				return;
			}

			warningEmitted = true;
			options.warn(
				`No configured fast model profile was found; using built-in ${formatModelRef(selection.modelSelection)} with ${selection.modelSelection.thinking} thinking.`,
			);
		},
	};
}
