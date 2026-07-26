import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
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
	type BranchContextCreationPolicy,
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
		creation: BranchContextCreationPolicy;
	},
): Promise<PreparedPlanBranchContext> {
	const slugEvidence = await derivePlanContentSlug(pi, {
		filePath: options.plan.filePath,
		cwd: options.checkout.repoRoot,
	});
	const initialOperation = buildBranchContextCreateOperation({
		slug: slugEvidence.slug,
		filePath: options.plan.filePath,
		creation: options.creation,
		...optionalEntries({ summary: options.plan.summary }),
	});
	const operation =
		options.creation.type === "graphite-current-parent-current-head"
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
		options.creation.type === "graphite-current-parent-current-head"
			? await resolveBranchContextCreatePreviewContext(pi, {
					cwd: options.checkout.repoRoot,
					context: options.context,
					creation: options.creation,
				})
			: options.creation.type === "graphite-explicit"
				? {
						type: "graphite" as const,
						startPoint: options.creation.startPoint,
						parent: { type: "resolved" as const, branch: options.creation.parentBranch },
					}
				: {
						type: "plain-git" as const,
						startPoint:
							options.creation.type === "plain-git-explicit" ? options.creation.startPoint : "HEAD",
					};
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
	if (
		prepared.operation.creation.type === "plain-git-current-head" ||
		prepared.operation.creation.type === "graphite-current-parent-current-head"
	) {
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
