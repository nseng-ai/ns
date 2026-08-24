import {
	formatModelPolicyFallbackWarning,
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/extension-kit/model-policy";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { createNsGitGateway } from "@nseng-ai/extension-kit";

export interface ResolvedFlowModelSelection {
	readonly ok: true;
	readonly modelSelection: ModelSelection;
	readonly warning?: string;
}

export interface FlowModelWarningEmitter {
	emit(...resolutions: readonly ResolvedFlowModelSelection[]): void;
}

export async function resolveFlowModelSelection(
	ctx: NsExtensionApi,
	operationId: ModelOperationId,
	git: Pick<GitGateway, "optionalRepoRoot"> = createNsGitGateway(ctx),
): Promise<ResolvedFlowModelSelection | { ok: false; error: string }> {
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
	const resolved = resolveModelOperation(policy.value, operationId);
	if (!resolved.ok) return { ok: false, error: resolved.error.message };
	const warning = formatModelPolicyFallbackWarning(resolved.value);
	return {
		ok: true,
		modelSelection: resolved.value.selection,
		...(warning === undefined ? {} : { warning }),
	};
}

export function createFlowModelWarningEmitter(
	ctx: Pick<NsExtensionApi, "stderr">,
): FlowModelWarningEmitter {
	const emitted = new Set<string>();
	return {
		emit: (...resolutions) => {
			for (const resolution of resolutions) {
				if (resolution.warning === undefined || emitted.has(resolution.warning)) continue;
				emitted.add(resolution.warning);
				ctx.stderr?.(`${resolution.warning}\n`);
			}
		},
	};
}
