import {
	createBranchContextFromFile,
	loadBranchContextPlan,
	type BranchCreationMethod,
} from "@ns/branch-context/api";
import { resolveSelectedSavedPlanFile, writeSavedPlanFile } from "@ns/plans/api";
import type { BranchContextExtensionOptions, BranchContextOperations } from "./host-types.ts";

const realBranchContextOperations: BranchContextOperations = {
	loadBranchContextPlan,
	createBranchContextFromFile,
	writeSavedPlanFile,
	resolveSelectedSavedPlanFile,
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
