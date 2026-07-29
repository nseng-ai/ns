import type { BranchCreationBasis } from "@nseng-ai/extension-kit/branch-creation";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { resolvePlanSourceFile } from "@nseng-ai/plans";
import type { PlanStoreDirectoryEvidence, ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";

import {
	buildBranchContextCreateOperation,
	createBranchContextFromFile,
	createBranchContextFromResolvedSource,
	formatBranchContextCreatePreview,
	resolveBranchContextCreatePreviewContext,
	selectBranchContextCreateOperationTarget,
	type BranchContextCreateOperation,
	type BranchContextEvidence,
} from "./branch-context-creation.ts";
import type { BranchContextCreationContext } from "./context.ts";
import { derivePlanContentSlug } from "./plan-content-slug.ts";

interface PreparedPlanBranchContextDetails {
	plan: ValidatedSessionSavedPlan;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	context: BranchContextCreationContext;
}

export interface ReadyPreparedPlanBranchContext extends PreparedPlanBranchContextDetails {
	type: "ready";
}

export interface PreviewPreparedPlanBranchContext extends PreparedPlanBranchContextDetails {
	type: "preview";
	preview: string;
}

export type PreparedPlanBranchContext =
	| ReadyPreparedPlanBranchContext
	| PreviewPreparedPlanBranchContext;

export async function preparePlanBranchContext(
	pi: CommandExecApi,
	options: {
		plan: ValidatedSessionSavedPlan;
		checkout: PlanStoreDirectoryEvidence;
		context: BranchContextCreationContext;
		shouldBuildPreview?: boolean;
		basis: BranchCreationBasis;
	},
): Promise<PreparedPlanBranchContext> {
	const slugEvidence = await derivePlanContentSlug(pi, {
		filePath: options.plan.filePath,
		cwd: options.checkout.repoRoot,
	});
	const initialOperation = buildBranchContextCreateOperation({
		slug: slugEvidence.slug,
		filePath: options.plan.filePath,
		basis: options.basis,
		...optionalEntries({ summary: options.plan.summary }),
	});
	const operation = await selectBranchContextCreateOperationTarget({
		cwd: options.checkout.repoRoot,
		operation: initialOperation,
		git: options.context.git,
		brmem: options.context.brmem,
		isExplicitTargetBranch: false,
	});
	const details: PreparedPlanBranchContextDetails = {
		plan: options.plan,
		checkout: options.checkout,
		operation,
		context: options.context,
	};
	if (!(options.shouldBuildPreview ?? false)) return { type: "ready", ...details };
	const previewContext = await resolveBranchContextCreatePreviewContext(pi, {
		cwd: options.checkout.repoRoot,
		context: options.context,
		basis: options.basis,
	});
	return {
		type: "preview",
		...details,
		preview: formatBranchContextCreatePreview(operation, previewContext),
	};
}

export async function createPreparedPlanBranchContext(
	pi: CommandExecApi,
	prepared: PreparedPlanBranchContext,
): Promise<BranchContextEvidence> {
	if (prepared.operation.basis.type === "current-head") {
		return createBranchContextFromFile(pi, prepared.operation.params, {
			cwd: prepared.checkout.repoRoot,
			context: prepared.context,
		});
	}
	const sourceFile = await resolvePlanSourceFile(pi, {
		cwd: prepared.checkout.repoRoot,
		rawFilePath: prepared.operation.filePath,
		git: prepared.context.git,
	});
	return createBranchContextFromResolvedSource({
		cwd: prepared.checkout.repoRoot,
		operation: prepared.operation,
		sourceFile,
		git: prepared.context.git,
		brmem: prepared.context.brmem,
		branchCreation: prepared.context.branchCreation,
	});
}
