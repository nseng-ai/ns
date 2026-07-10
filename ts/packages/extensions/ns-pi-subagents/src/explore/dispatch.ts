import {
	composePiAgentPrompt,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { isProviderAuthConfigured } from "@nseng-ai/pi/runtime/auth";

import {
	hasAbortedSignal,
	READ_ONLY_SUBAGENT_TOOLS,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentProgressCallback,
	type RunnerSubagentResult,
	type RunnerSubagentRetryEvidence,
	type RunnerSubagentTransientFailureStatus,
} from "../runner-subagents/index.ts";
import {
	resolveExplorerLaunchPlan,
	type ExplorerLaunchPlan,
	type IsProviderAuthConfigured,
} from "./model-policy.ts";
import { createSubprocessSubagentRuntime, type SubagentRuntime } from "../runtime/seam.ts";

export interface DispatchExplorerSubagentOptions {
	title: string;
	prompt: string;
	model?: string;
	signal?: AbortSignal;
	onProgress?: RunnerSubagentProgressCallback;
}

export interface ExplorerDispatcherDependencies {
	isProviderAuthConfigured?: IsProviderAuthConfigured;
	runtime?: SubagentRuntime;
}

export type ExplorerRetryEvidence = RunnerSubagentRetryEvidence;

export interface ExplorerDispatchOutcome {
	result: RunnerSubagentResult;
	launchPlan: ExplorerLaunchPlan;
	retry?: ExplorerRetryEvidence;
}

const EXPLORER_TRANSIENT_FAILURE_STATUSES = ["error", "protocol-error"] as const;
type ExplorerTransientFailureStatus = RunnerSubagentTransientFailureStatus;
type ExplorerTransientFailureResult = Extract<
	RunnerSubagentResult,
	{ status: ExplorerTransientFailureStatus }
>;

export interface DispatchExplorerSubagentInput {
	pi: RunnerSubagentPi;
	ctx: RunnerSubagentContext;
	intent: DispatchExplorerSubagentOptions;
	definition: PiAgentDefinition;
	dependencies?: ExplorerDispatcherDependencies;
}

export async function dispatchExplorerSubagent(
	input: DispatchExplorerSubagentInput,
): Promise<ExplorerDispatchOutcome> {
	const { pi, ctx, intent, definition } = input;
	const dependencies = input.dependencies ?? {};
	const authProbe = dependencies.isProviderAuthConfigured ?? isProviderAuthConfigured;
	const runtime = dependencies.runtime ?? createSubprocessSubagentRuntime();
	const launchPlan: ExplorerLaunchPlan =
		intent.model === undefined
			? resolveExplorerLaunchPlan({
					...(ctx.model === undefined ? {} : { parentModel: ctx.model }),
					isProviderAuthConfigured: authProbe,
				})
			: { kind: "explicit", model: intent.model };
	const childPrompt = composePiAgentPrompt(definition, {
		title: intent.title,
		prompt: intent.prompt,
	});
	const baseOptions: RunnerSubagentOptions = {
		title: intent.title,
		prompt: childPrompt,
		returnMode: "final-text",
		tools: READ_ONLY_SUBAGENT_TOOLS,
		...(intent.signal === undefined ? {} : { signal: intent.signal }),
		...(intent.onProgress === undefined ? {} : { onProgress: intent.onProgress }),
	};

	const selectedOptions =
		launchPlan.kind === "inherit" ? baseOptions : { ...baseOptions, model: launchPlan.model };
	const firstResult = await runtime.dispatch({ pi, ctx, options: selectedOptions });
	const retryInput: ShouldRetryExplorerDispatchInput = {
		result: firstResult,
		abortSignals: [ctx.signal, intent.signal],
	};
	if (!shouldRetryExplorerDispatch(retryInput)) {
		return { result: firstResult, launchPlan };
	}

	const retryResult = await runtime.dispatch({ pi, ctx, options: selectedOptions });
	return {
		result: retryResult,
		launchPlan,
		retry: {
			firstAttemptStatus: retryInput.result.status,
			firstAttemptDiagnostic: retryInput.result.diagnostic,
		},
	};
}

interface ShouldRetryExplorerDispatchInput {
	result: RunnerSubagentResult;
	abortSignals: ReadonlyArray<AbortSignal | undefined>;
}

/**
 * Retry only infrastructure-shaped failures. Cancelled runs honor the caller's intent,
 * and stopped-without-* statuses mean the child ran but produced unusable output.
 */
function shouldRetryExplorerDispatch(
	input: ShouldRetryExplorerDispatchInput,
): input is ShouldRetryExplorerDispatchInput & { result: ExplorerTransientFailureResult } {
	return !hasAbortedSignal(...input.abortSignals) && isExplorerTransientFailureResult(input.result);
}

function isExplorerTransientFailureResult(
	result: RunnerSubagentResult,
): result is ExplorerTransientFailureResult {
	return EXPLORER_TRANSIENT_FAILURE_STATUSES.some((status) => status === result.status);
}
