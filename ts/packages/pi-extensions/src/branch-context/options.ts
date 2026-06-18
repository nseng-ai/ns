import {
	createBranchContextFromFile as createBranchContextFromFilePrimitive,
	loadBranchContextPlan,
	type BranchCreationMethod,
} from "@asdl/branch-context";
import {
	resolveSelectedSavedPlanFile as resolveSelectedSavedPlanFilePrimitive,
	writeSavedPlanFile as writeSavedPlanFilePrimitive,
} from "@asdl/plans";
import type { BranchContextExtensionOptions, BranchContextOperations } from "./host-types.ts";

const realBranchContextOperations: BranchContextOperations = {
	loadBranchContextPlan,
	createBranchContextFromFile: createBranchContextFromFilePrimitive,
	writeSavedPlanFile: writeSavedPlanFilePrimitive,
	resolveSelectedSavedPlanFile: resolveSelectedSavedPlanFilePrimitive,
};

export function resolveBranchContextOperations(
	options: BranchContextExtensionOptions,
): BranchContextOperations {
	return options.branchContextOperations ?? realBranchContextOperations;
}

export function resolveBranchContextDefaultCreation(
	options: BranchContextExtensionOptions,
): BranchCreationMethod {
	return options.branchContextDefaultCreation ?? "plain-git";
}

export function resolvePlanStoreRootOption(
	options: BranchContextExtensionOptions,
): string | undefined {
	return options.planStoreRoot;
}
