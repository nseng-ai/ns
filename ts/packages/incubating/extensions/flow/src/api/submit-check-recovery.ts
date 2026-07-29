import type { GitGateway } from "@nseng-ai/foundation/git";

import { flowExtensionDescriptorSource } from "../ns/extension.ts";
import {
	buildFlowSubmitCheckRecoveryMessage,
	hasFlowSubmitCheckFailureMarker,
	nodeSubmitCheckRecoveryPromptGateway,
	resolveFlowSubmitRecoveryPrompt,
	resolveFlowSubmitRecoveryRepositoryRoot,
	type FlowSubmitRecoveryCommandDetails,
	type SubmitCheckRecoveryPromptGateway,
} from "../submit/submit-check-recovery.ts";

export type FlowSubmitRecoveryGitGateway = Pick<GitGateway, "optionalRepoRoot">;

export type FlowSubmitCheckRecoveryResult =
	| { type: "not-applicable" }
	| { type: "ready"; message: string }
	| { type: "failed"; error: string };

export interface ResolveFlowSubmitCheckRecoveryOptions {
	details: FlowSubmitRecoveryCommandDetails;
	git: FlowSubmitRecoveryGitGateway;
	promptGateway?: SubmitCheckRecoveryPromptGateway;
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

	const prompt = resolveFlowSubmitRecoveryPrompt({
		repoRoot: repoRoot.repoRoot,
		gateway: options.promptGateway ?? nodeSubmitCheckRecoveryPromptGateway,
		descriptorSource: flowExtensionDescriptorSource,
	});
	if (!prompt.ok) return { type: "failed", error: prompt.error };

	return {
		type: "ready",
		message: buildFlowSubmitCheckRecoveryMessage(options.details, prompt.prompt),
	};
}

export type { SubmitCheckRecoveryPromptGateway } from "../submit/submit-check-recovery.ts";
