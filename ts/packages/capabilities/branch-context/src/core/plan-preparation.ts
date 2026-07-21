import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { PlanStoreDirectoryEvidence, ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";
import { resolvePlanSourceFile } from "@nseng-ai/plans";

import {
	buildBranchContextCreateOperation,
	createBranchContextFromFile,
	createBranchContextFromResolvedSource,
	formatBranchContextCreatePreview,
	resolveBranchContextCreatePreviewContext,
	selectBranchContextCreateOperationTarget,
	type BranchContextCreateOperation,
	type BranchContextEvidence,
	type BranchContextExplicitBasis,
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
		explicitBasis?: BranchContextExplicitBasis;
	},
): Promise<PreparedPlanBranchContext> {
	const slugEvidence = await derivePlanContentSlug(pi, {
		filePath: options.plan.filePath,
		cwd: options.checkout.repoRoot,
	});
	const initialOperation = buildBranchContextCreateOperation({
		slug: slugEvidence.slug,
		filePath: options.plan.filePath,
		branchCreation: "graphite",
		...optionalEntry("explicitBasis", options.explicitBasis),
		...optionalEntry("summary", options.plan.summary),
	});
	const operation =
		options.explicitBasis === undefined
			? initialOperation
			: await selectBranchContextCreateOperationTarget({
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
	if (!(options.shouldBuildPreview ?? false)) {
		return { type: "ready", ...details };
	}
	const previewContext =
		options.explicitBasis === undefined
			? await resolveBranchContextCreatePreviewContext(pi, {
					cwd: options.checkout.repoRoot,
					context: options.context,
				})
			: {
					startPoint: options.explicitBasis.startPoint,
					graphiteParentBranch: options.explicitBasis.graphiteParentBranch,
				};
	return {
		type: "preview",
		...details,
		preview: formatBranchContextCreatePreview(operation, {
			...previewContext,
			graphiteParentBranch: previewContext.graphiteParentBranch ?? options.checkout.sourceBranch,
		}),
	};
}

export async function createPreparedPlanBranchContext(
	pi: CommandExecApi,
	prepared: PreparedPlanBranchContext,
): Promise<BranchContextEvidence> {
	if (prepared.operation.explicitBasis === undefined) {
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
		graphite: prepared.context.graphite,
	});
}
