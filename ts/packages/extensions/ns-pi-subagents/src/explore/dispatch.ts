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
} from "../runner-subagents/index.ts";
import {
	resolveExplorerLaunchPlan,
	type ExplorerLaunchPlan,
	type IsProviderAuthConfigured,
} from "./model-policy.ts";
import { createSubprocessExplorerRuntime, type ExplorerRuntime } from "./runtime.ts";

export interface DispatchExplorerSubagentOptions {
	title: string;
	prompt: string;
	signal?: AbortSignal;
	onProgress?: RunnerSubagentProgressCallback;
}

export interface ExplorerDispatcherDependencies {
	isProviderAuthConfigured?: IsProviderAuthConfigured;
	runtime?: ExplorerRuntime;
}

export interface ExplorerDispatchOutcome {
	result: RunnerSubagentResult;
	launchPlan: ExplorerLaunchPlan;
	failover?: {
		firstAttemptStatus: ExplorerTransientFailureStatus;
		firstAttemptDiagnostic: string;
	};
}

const EXPLORER_TRANSIENT_FAILURE_STATUSES = ["error", "protocol-error"] as const;
type ExplorerTransientFailureStatus = (typeof EXPLORER_TRANSIENT_FAILURE_STATUSES)[number];
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
	const runtime = dependencies.runtime ?? createSubprocessExplorerRuntime();
	const launchPlan = resolveExplorerLaunchPlan({
		...(ctx.model === undefined ? {} : { parentModel: ctx.model }),
		isProviderAuthConfigured: authProbe,
	});
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

	const firstResult = await runtime.dispatch({
		pi,
		ctx,
		options:
			launchPlan.kind === "cheap" ? { ...baseOptions, model: launchPlan.model } : baseOptions,
	});
	const failoverInput: ShouldFailoverExplorerDispatchInput = {
		launchPlan,
		result: firstResult,
		abortSignals: [ctx.signal, intent.signal],
	};
	if (!shouldFailoverExplorerDispatch(failoverInput)) {
		return { result: firstResult, launchPlan };
	}

	const failoverResult = await runtime.dispatch({ pi, ctx, options: baseOptions });
	return {
		result: failoverResult,
		launchPlan,
		failover: {
			firstAttemptStatus: failoverInput.result.status,
			firstAttemptDiagnostic: failoverInput.result.diagnostic,
		},
	};
}

interface ShouldFailoverExplorerDispatchInput {
	launchPlan: ExplorerLaunchPlan;
	result: RunnerSubagentResult;
	abortSignals: ReadonlyArray<AbortSignal | undefined>;
}

/**
 * Failover retries only infrastructure-shaped failures of the cheap model. Cancelled
 * runs honor the caller's intent, and stopped-without-* statuses mean the child ran but
 * produced unusable output — a prompt problem a different model will not fix.
 */
function shouldFailoverExplorerDispatch(
	input: ShouldFailoverExplorerDispatchInput,
): input is ShouldFailoverExplorerDispatchInput & { result: ExplorerTransientFailureResult } {
	return (
		input.launchPlan.kind === "cheap" &&
		!hasAbortedSignal(...input.abortSignals) &&
		isExplorerTransientFailureResult(input.result)
	);
}

function isExplorerTransientFailureResult(
	result: RunnerSubagentResult,
): result is ExplorerTransientFailureResult {
	return EXPLORER_TRANSIENT_FAILURE_STATUSES.some((status) => status === result.status);
}
