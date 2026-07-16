import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { PlanStoreDirectoryEvidence, ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";

import {
	buildBranchContextCreateOperation,
	createBranchContextFromFile,
	formatBranchContextCreatePreview,
	resolveBranchContextCreatePreviewContext,
	type BranchContextCreateOperation,
	type BranchContextEvidence,
} from "./branch-context-creation.ts";
import type { BranchContextContext } from "./context.ts";
import { derivePlanContentSlug } from "./plan-content-slug.ts";

interface PreparedPlanBranchContextDetails {
	plan: ValidatedSessionSavedPlan;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	context: BranchContextContext;
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
		context: BranchContextContext;
		shouldBuildPreview?: boolean;
	},
): Promise<PreparedPlanBranchContext> {
	const slugEvidence = await derivePlanContentSlug(pi, {
		filePath: options.plan.filePath,
		cwd: options.checkout.repoRoot,
	});
	const operation = buildBranchContextCreateOperation({
		slug: slugEvidence.slug,
		filePath: options.plan.filePath,
		branchCreation: "graphite",
		...optionalEntry("summary", options.plan.summary),
	});
	const details: PreparedPlanBranchContextDetails = {
		plan: options.plan,
		checkout: options.checkout,
		operation,
		context: options.context,
	};
	if (!(options.shouldBuildPreview ?? false)) {
		return { type: "ready", ...details };
	}
	const previewContext = await resolveBranchContextCreatePreviewContext(pi, {
		cwd: options.checkout.repoRoot,
		context: options.context,
	});
	return {
		type: "preview",
		...details,
		preview: formatBranchContextCreatePreview(operation, {
			...previewContext,
			graphiteParentBranch: options.checkout.sourceBranch,
		}),
	};
}

export async function createPreparedPlanBranchContext(
	pi: CommandExecApi,
	prepared: PreparedPlanBranchContext,
): Promise<BranchContextEvidence> {
	return createBranchContextFromFile(pi, prepared.operation.params, {
		cwd: prepared.checkout.repoRoot,
		context: prepared.context,
	});
}
