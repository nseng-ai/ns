import {
	createBranchContextFromFile,
	loadBranchContextPlan,
	prepareBranchContextCreation,
} from "@nseng-ai/branch-context/api";
import { resolveSelectedSavedPlanFile, writeSavedPlanFile } from "@nseng-ai/plans/api";
import type { BranchContextExtensionOptions, BranchContextOperations } from "./host-types.ts";

const realBranchContextOperations: BranchContextOperations = {
	prepareBranchContextCreation,
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

export function resolvePlanStoreRootOption(
	options: BranchContextExtensionOptions,
): string | undefined {
	return options.planStoreRoot;
}
