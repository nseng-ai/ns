import {
	MODEL_OPERATION_IDS,
	resolveEffectiveModelOperation,
	type EffectiveModelPolicyError,
} from "@nseng-ai/extension-kit/model-policy";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { EffectiveProjectConfig } from "@nseng-ai/sdk/project-config";

export async function resolveHerdrSlugModelSelection(
	projectConfig: EffectiveProjectConfig,
): Promise<ModelSelection> {
	const resolved = await resolveEffectiveModelOperation(projectConfig, MODEL_OPERATION_IDS.slug);
	if (!resolved.ok) throw new Error(formatHerdrModelPolicyError(resolved.error));
	return resolved.value.selection;
}

function formatHerdrModelPolicyError(error: EffectiveModelPolicyError): string {
	if (error.type === "model-policy") {
		return `Invalid model policy in ns.toml: ${error.error.message}`;
	}
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
