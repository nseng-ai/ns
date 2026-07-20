export {
	BRANCH_CONTEXT_NAMESPACE,
	branchContextCreationPolicyFromMethod,
	buildBranchContextCreateOperation,
	buildBranchContextPlanKey,
	createBranchContextFromFile,
	deriveTargetBranch,
	selectBranchContextCreateOperationTarget,
	formatBranchContextEvidence,
	formatBranchContextCreateFailure,
	formatBranchContextCreatePreview,
	formatBranchSelectionLines,
	describeBranchContextGraphiteCreationSteps,
	resolveBranchContextCreatePreviewContext,
	type BranchContextBranchSelection,
	type BranchContextBranchSelectionCollision,
	type BranchContextCreateOperation,
	type BranchContextCreationPolicy,
	type BranchContextEvidence,
	type BranchContextEvidenceCreation,
	type BranchCreationMethod,
} from "../core/branch-context-creation.ts";
export {
	buildImplBranchContextPrompt,
	formatLoadedAttachedPlanEvidence,
	loadBranchContextPlan,
	type LoadedAttachedPlan,
} from "../core/attached-plan.ts";
export {
	createBranchContextContext,
	createRealBranchContextContext,
	type BranchContextContext,
	type BranchContextContextFactory,
	type BranchContextContextOptions,
} from "../core/context.ts";
export {
	formatExistingBranchContextReuse,
	resolveExistingBranchContextReuse,
	type ExistingBranchContextReuse,
} from "../core/existing-branch-reuse.ts";
export {
	createPreparedPlanBranchContext,
	preparePlanBranchContext,
	type PreparedPlanBranchContext,
	type PreviewPreparedPlanBranchContext,
	type ReadyPreparedPlanBranchContext,
} from "../core/plan-preparation.ts";
export {
	buildPlanContentSlugPrompt,
	derivePlanContentSlug,
	type PlanContentSlugEvidence,
} from "../core/plan-content-slug.ts";
export {
	buildBranchContextOutputMessage,
	findLatestBranchContextEvidence,
	type BranchContextOutputDetails,
} from "../core/session-artifact.ts";
export {
	confirmInferredBranchContext,
	resolveInferredBranchContext,
	type InferredBranchConfirmationContext,
	type InferredBranchContextResolution,
} from "../core/inferred-branch.ts";
