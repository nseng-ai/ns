import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type { PlanStoreDirectoryEvidence, ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";
import { resolvePlanSourceFile } from "@nseng-ai/plans";

import {
	buildBranchContextCreateOperation,
	createBranchContextFromFile,
	createBranchContextFromResolvedSource,
	describeBranchContextCreationPolicy,
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
	const creationDescriptor = describeBranchContextCreationPolicy(options.creation);
	const operation =
		creationDescriptor.method === "graphite" && creationDescriptor.parent.type === "current-branch"
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
		creationDescriptor.method === "graphite" && creationDescriptor.parent.type === "current-branch"
			? await resolveBranchContextCreatePreviewContext(pi, {
					cwd: options.checkout.repoRoot,
					context: options.context,
					creation: options.creation,
				})
			: creationDescriptor.method === "graphite" && creationDescriptor.parent.type === "explicit"
				? {
						type: "graphite" as const,
						startPoint:
							creationDescriptor.start.type === "explicit"
								? creationDescriptor.start.point
								: creationDescriptor.start.ref,
						parent: { type: "resolved" as const, branch: creationDescriptor.parent.branch },
					}
				: {
						type: "plain-git" as const,
						startPoint:
							creationDescriptor.start.type === "explicit"
								? creationDescriptor.start.point
								: creationDescriptor.start.ref,
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
		describeBranchContextCreationPolicy(prepared.operation.creation).start.type === "current-head"
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
		...optionalEntries({
			branchCreation: prepared.context.branchCreation,
			graphite: prepared.context.graphite,
		}),
	});
}
