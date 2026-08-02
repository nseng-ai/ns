import type { GitGateway } from "@nseng-ai/foundation/git";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { nodePromptPointContentReader } from "@nseng-ai/sdk/project-config/prompt-content";

import { flowExtensionDescriptorSource } from "../ns/extension.ts";
import {
	buildFlowSubmitCheckRecoveryMessage,
	hasFlowSubmitCheckFailureMarker,
	resolveFlowSubmitRecoveryPrompt,
	resolveFlowSubmitRecoveryRepositoryRoot,
	type FlowSubmitRecoveryCommandDetails,
	type FlowSubmitRecoveryContext,
} from "../submit/submit-check-recovery.ts";

export type { FlowSubmitRecoveryContext } from "../submit/submit-check-recovery.ts";

export type FlowSubmitRecoveryGitGateway = Pick<GitGateway, "optionalRepoRoot">;

/** Flow-owned real recovery context binding the SDK Node adapters once. */
export const nodeFlowSubmitRecoveryContext: FlowSubmitRecoveryContext = {
	projectConfigGateway: nodeProjectConfigGateway,
	promptReader: nodePromptPointContentReader,
};

export type FlowSubmitCheckRecoveryResult =
	| { type: "not-applicable" }
	| { type: "ready"; message: string }
	| { type: "failed"; error: string };

export interface ResolveFlowSubmitCheckRecoveryOptions {
	details: FlowSubmitRecoveryCommandDetails;
	git: FlowSubmitRecoveryGitGateway;
	recoveryContext: FlowSubmitRecoveryContext;
}

export async function resolveFlowSubmitCheckRecovery(
	options: ResolveFlowSubmitCheckRecoveryOptions,
): Promise<FlowSubmitCheckRecoveryResult> {
	if (options.details.exitCode === 0) return { type: "not-applicable" };
	if (!hasFlowSubmitCheckFailureMarker(options.details.stderr)) {
		return { type: "not-applicable" };
	}

	const repoRoot = await resolveFlowSubmitRecoveryRepositoryRoot({
		cwd: options.details.cwd,
		git: options.git,
	});
	if (!repoRoot.ok) return { type: "failed", error: repoRoot.error };

	const prompt = await resolveFlowSubmitRecoveryPrompt({
		repoRoot: repoRoot.repoRoot,
		context: options.recoveryContext,
		descriptorSource: flowExtensionDescriptorSource,
	});
	if (!prompt.ok) return { type: "failed", error: prompt.error };

	return {
		type: "ready",
		message: buildFlowSubmitCheckRecoveryMessage(options.details, prompt.prompt),
	};
}
