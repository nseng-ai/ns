import {
	resolveEffectiveModelOperation,
	type EffectiveModelPolicyError,
	type ModelOperationId,
} from "@nseng-ai/extension-kit/model-policy";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { NsExtensionApi } from "@nseng-ai/sdk";

export async function resolveFlowModelSelection(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
): Promise<{ ok: true; modelSelection: ModelSelection } | { ok: false; error: string }> {
	const resolved = await resolveEffectiveModelOperation(ctx.projectConfig, operationId);
	return resolved.ok
		? { ok: true, modelSelection: resolved.value.selection }
		: { ok: false, error: formatModelPolicyError(resolved.error) };
}

function formatModelPolicyError(error: EffectiveModelPolicyError): string {
	if (error.type === "model-policy") {
		return error.error.code === "missing-profile"
			? error.error.message
			: `Invalid model policy in ns.toml: ${error.error.message}`;
	}
	switch (error.error.code) {
		case "project-not-found":
			return "Could not determine the repository root for ns.toml.";
		case "project-discovery-failed":
			return "Could not determine the repository root for ns.toml.";
		case "source-read-failed":
		case "invalid-source":
		case "invalid-setting":
			return `Invalid model policy in ns.toml: ${projectConfigErrorMessage(error.error)}`;
	}
}

function projectConfigErrorMessage(
	error: Extract<EffectiveModelPolicyError, { type: "project-config" }>["error"],
): string {
	switch (error.code) {
		case "project-not-found":
			return `project not found from ${error.cwd}`;
		case "project-discovery-failed":
		case "source-read-failed":
			return error.message;
		case "invalid-source":
			return error.diagnostics[0]?.message ?? `${error.path}: invalid ns.toml`;
		case "invalid-setting":
			return error.message;
	}
}
