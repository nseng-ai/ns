import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { isProviderAuthConfigured } from "@nseng-ai/pi/runtime/auth";

import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentProgressCallback,
	type RunnerSubagentResult,
} from "../runner-subagents/extension-api.ts";
import { hasAbortedSignal } from "../runner-subagents/abort-signals.ts";
import { READ_ONLY_SUBAGENT_TOOLS } from "../runner-subagents/read-only-tools.ts";
import { EXPLORER_AGENT_NAME } from "./contract.ts";
import {
	resolveExplorerLaunchPlan,
	type ExplorerLaunchPlan,
	type IsProviderAuthConfigured,
} from "./model-policy.ts";

export type DispatchSubagentFn = (
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
) => Promise<RunnerSubagentResult>;

export interface DispatchExplorerSubagentOptions {
	title: string;
	prompt: string;
	/** Directory for agent-definition discovery; defaults to ctx.cwd. */
	cwd?: string;
	signal?: AbortSignal;
	onProgress?: RunnerSubagentProgressCallback;
}

export interface ExplorerDispatcherDependencies {
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
	isProviderAuthConfigured?: IsProviderAuthConfigured;
	dispatchSubagent?: DispatchSubagentFn;
}

export interface ExplorerDispatchOutcome {
	result: RunnerSubagentResult;
	definition: PiAgentDefinition;
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
	dependencies?: ExplorerDispatcherDependencies;
}

export async function dispatchExplorerSubagent(
	input: DispatchExplorerSubagentInput,
): Promise<ExplorerDispatchOutcome> {
	const { pi, ctx, intent } = input;
	const dependencies = input.dependencies ?? {};
	const loadDefinition = dependencies.loadAgentDefinition ?? loadPiAgentDefinition;
	const authProbe = dependencies.isProviderAuthConfigured ?? isProviderAuthConfigured;
	const dispatch = dependencies.dispatchSubagent ?? dispatchRunnerSubagent;
	const definition = loadDefinition(EXPLORER_AGENT_NAME, intent.cwd ?? ctx.cwd);
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

	const firstResult = await dispatch(
		pi,
		ctx,
		launchPlan.kind === "cheap" ? { ...baseOptions, model: launchPlan.model } : baseOptions,
	);
	const failoverInput: ShouldFailoverExplorerDispatchInput = {
		launchPlan,
		result: firstResult,
		abortSignals: [ctx.signal, intent.signal],
	};
	if (!shouldFailoverExplorerDispatch(failoverInput)) {
		return { result: firstResult, definition, launchPlan };
	}

	const failoverResult = await dispatch(pi, ctx, baseOptions);
	return {
		result: failoverResult,
		definition,
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
