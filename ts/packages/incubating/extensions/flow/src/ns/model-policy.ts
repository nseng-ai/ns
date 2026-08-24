import {
	createModelExecutionCoordinator,
	modelExecutionSelectionFromResolvedOperation,
	type ModelExecutionCoordinator,
	type ModelExecutionSelection,
} from "@nseng-ai/extension-kit/model-execution";
import {
	loadModelPolicy,
	resolveModelOperation,
	type ModelOperationId,
} from "@nseng-ai/extension-kit/model-policy";
import type { TextGenerator } from "@nseng-ai/extension-kit/text-generation";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

export type ResolvedFlowModelExecution =
	| { readonly ok: true; readonly selection: ModelExecutionSelection }
	| { readonly ok: false; readonly error: string };

export interface FlowModelExecution {
	readonly coordinator: ModelExecutionCoordinator;
	resolve(operationId: ModelOperationId): Promise<ResolvedFlowModelExecution>;
	textGenerator(selection: ModelExecutionSelection): TextGenerator;
}

/** Owns model selection and fallback presentation for one Flow command invocation. */
export function createFlowModelExecution(
	ctx: NsExtensionApi,
	git: Pick<GitGateway, "optionalRepoRoot"> = createNsGitGateway(ctx),
): FlowModelExecution {
	const coordinator = createModelExecutionCoordinator({
		warn: (message) => ctx.stderr?.(`${message}\n`),
	});
	return {
		coordinator,
		async resolve(operationId) {
			const repository = await git.optionalRepoRoot({ cwd: ctx.cwd });
			if (repository.type !== "found") {
				return { ok: false, error: "Could not determine the repository root for ns.toml." };
			}
			const policy = loadModelPolicy({
				repoRoot: repository.value,
				gateway: createNodeProjectConfigGateway(),
			});
			if (!policy.ok) {
				return { ok: false, error: `Invalid model policy in ns.toml: ${policy.error.message}` };
			}
			const resolved = resolveModelOperation(policy.value, operationId);
			if (!resolved.ok) return { ok: false, error: resolved.error.message };
			return {
				ok: true,
				selection: modelExecutionSelectionFromResolvedOperation(resolved.value),
			};
		},
		textGenerator(selection) {
			return {
				async generateText(request) {
					coordinator.beforeExecution(selection);
					return await ctx.textGenerator.generateText(request);
				},
			};
		},
	};
}
