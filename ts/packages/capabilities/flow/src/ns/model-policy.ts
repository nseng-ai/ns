import {
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/capability-kit/model-policy";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatModelRef } from "@nseng-ai/foundation/model-slug";
import { createNsGitGateway } from "@nseng-ai/capability-kit";

export async function resolveFlowModelRef(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
	git: Pick<GitGateway, "optionalRepoRoot"> = createNsGitGateway(ctx),
): Promise<{ ok: true; modelRef: string } | { ok: false; error: string }> {
	const repository = await git.optionalRepoRoot({ cwd: ctx.cwd });
	if (repository.type !== "found") {
		return { ok: false, error: "Could not determine the repository root for ns.toml." };
	}
	const policy = loadModelPolicy({ repoRoot: repository.value, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, error: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const resolved = resolveModelOperation(policy.value, operationId);
	return resolved.ok
		? { ok: true, modelRef: formatModelRef(resolved.value.selection) }
		: { ok: false, error: resolved.error.message };
}
