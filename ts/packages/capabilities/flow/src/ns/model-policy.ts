import {
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/capability-kit/model-policy";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

export async function resolveFlowModelRef(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
): Promise<{ ok: true; modelRef: string } | { ok: false; error: string }> {
	const policy = loadModelPolicy({ repoRoot: ctx.cwd, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, error: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const resolved = resolveModelOperation(policy.value, operationId);
	return resolved.ok
		? { ok: true, modelRef: resolved.value.modelRef }
		: { ok: false, error: resolved.error.message };
}
