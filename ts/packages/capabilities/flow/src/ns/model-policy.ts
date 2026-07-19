import {
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/capability-kit/model-policy";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { createNsGitGateway } from "@nseng-ai/capability-kit";

export async function resolveFlowModelSelection(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
	git: Pick<GitGateway, "optionalRepoRoot"> = createNsGitGateway(ctx),
): Promise<{ ok: true; modelSelection: ModelSelection } | { ok: false; error: string }> {
	return resolveFlowModelSelectionAt({ cwd: ctx.cwd, git }, operationId);
}

export async function resolveFlowModelSelectionAt(
	context: { cwd: string; git: Pick<GitGateway, "optionalRepoRoot"> },
	operationId: ModelOperationId,
): Promise<{ ok: true; modelSelection: ModelSelection } | { ok: false; error: string }> {
	const repository = await context.git.optionalRepoRoot({ cwd: context.cwd });
	if (repository.type !== "found") {
		return { ok: false, error: "Could not determine the repository root for ns.toml." };
	}
	const policy = loadModelPolicy({ repoRoot: repository.value, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, error: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const resolved = resolveModelOperation(policy.value, operationId);
	return resolved.ok
		? { ok: true, modelSelection: resolved.value.selection }
		: { ok: false, error: resolved.error.message };
}
