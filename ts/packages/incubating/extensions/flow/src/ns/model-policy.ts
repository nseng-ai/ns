import {
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/extension-kit/model-policy";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { createNsGitGateway } from "@nseng-ai/extension-kit";

export function createFlowModelWarningPresenter(ctx: NsExtensionApi): (message: string) => void {
	const presented = new Set<string>();
	return (message) => {
		if (presented.has(message)) return;
		presented.add(message);
		ctx.commandIo.notify(message, "warning");
	};
}

export async function resolveFlowModelSelection(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
	presentWarning: (message: string) => void,
	git: Pick<GitGateway, "optionalRepoRoot"> = createNsGitGateway(ctx),
): Promise<{ ok: true; modelSelection: ModelSelection } | { ok: false; error: string }> {
	const repository = await git.optionalRepoRoot({ cwd: ctx.cwd });
	if (repository.type !== "found") {
		return { ok: false, error: "Could not determine the repository root for ns.toml." };
	}
	const policy = loadModelPolicy({
		repoRoot: repository.value,
		gateway: createNodeProjectConfigGateway(),
	});
	if (!policy.ok)
		return { ok: false, error: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const resolved = resolveModelOperation(policy.value, operationId, { presentWarning });
	if (!resolved.ok) return { ok: false, error: resolved.error.message };
	return { ok: true, modelSelection: resolved.value.selection };
}
