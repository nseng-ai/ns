import {
	createBranchContextFromFile,
	loadBranchContextPlan,
	type BranchCreationMethod,
} from "@nseng-ai/branch-context/api";
import {
	MODEL_OPERATION_IDS,
	resolveEffectiveModelOperation,
	type EffectiveModelPolicyError,
} from "@nseng-ai/extension-kit/model-policy";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resolveSelectedSavedPlanFile, writeSavedPlanFile } from "@nseng-ai/plans/api";
import type {
	BranchContextExtensionOptions,
	BranchContextOperations,
	ProjectConfigFactory,
} from "./host-types.ts";

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

export function resolveProjectConfigFactory(
	options: BranchContextExtensionOptions,
): ProjectConfigFactory {
	if (options.createProjectConfig === undefined) {
		throw new Error("Branch Context project-config composition is missing.");
	}
	return options.createProjectConfig;
}

export async function resolvePiSlugModelSelection(
	options: BranchContextExtensionOptions,
	scope: { cwd: string; signal?: AbortSignal },
): Promise<ModelSelection> {
	const projectConfig = resolveProjectConfigFactory(options)({
		cwd: scope.cwd,
		...optionalEntry("signal", scope.signal),
	});
	const resolved = await resolveEffectiveModelOperation(projectConfig, MODEL_OPERATION_IDS.slug);
	if (!resolved.ok) throw new Error(formatPiModelPolicyError(resolved.error));
	return resolved.value.selection;
}

function formatPiModelPolicyError(error: EffectiveModelPolicyError): string {
	if (error.type === "model-policy") return error.error.message;
	switch (error.error.code) {
		case "project-not-found":
			return "Could not determine the repository root for ns.toml.";
		case "project-discovery-failed":
			return `Could not determine the repository root for ns.toml: ${error.error.message}`;
		case "source-read-failed":
		case "invalid-setting":
			return `Invalid model policy in ns.toml: ${error.error.message}`;
		case "invalid-source":
			return `Invalid model policy in ns.toml: ${error.error.diagnostics[0]?.message ?? `${error.error.path}: invalid ns.toml`}`;
	}
}
