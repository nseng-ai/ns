import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { isProviderAuthConfigured } from "@nseng-ai/pi/runtime/auth";

import {
	createRunnerSubagentCancelledResult,
	dispatchRunnerSubagent,
	isRunnerSubagentTransientFailureResult,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentProgressCallback,
	type RunnerSubagentResult,
	type RunnerSubagentTransientFailureStatus,
} from "../runner-subagents/extension-api.ts";
import { EXPLORER_AGENT_NAME, EXPLORER_READ_ONLY_TOOLS } from "./contract.ts";
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

export type ExplorerDispatcher = (
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	intent: DispatchExplorerSubagentOptions,
) => Promise<ExplorerDispatchOutcome>;

export interface ExplorerDispatchOutcome {
	result: RunnerSubagentResult;
	definition: PiAgentDefinition;
	launchPlan: ExplorerLaunchPlan;
	failover?: {
		firstAttemptStatus: RunnerSubagentTransientFailureStatus;
		firstAttemptDiagnostic: string;
	};
}

const defaultExplorerDispatcher = createExplorerDispatcher();

export function createExplorerDispatcher(
	dependencies: ExplorerDispatcherDependencies = {},
): ExplorerDispatcher {
	const loadDefinition = dependencies.loadAgentDefinition ?? loadPiAgentDefinition;
	const authProbe = dependencies.isProviderAuthConfigured ?? isProviderAuthConfigured;
	const dispatch = dependencies.dispatchSubagent ?? dispatchRunnerSubagent;

	return async function dispatchExplorerSubagentWithDependencies(
		pi,
		ctx,
		intent,
	): Promise<ExplorerDispatchOutcome> {
		const definition = loadDefinition(EXPLORER_AGENT_NAME, intent.cwd ?? ctx.cwd);
		const launchPlan = resolveExplorerLaunchPlan({
			...(ctx.model === undefined ? {} : { parentModel: ctx.model }),
			isProviderAuthConfigured: authProbe,
		});
		const abortSignals = explorerAbortSignals(ctx, intent);

		if (abortSignals.some((signal) => signal.aborted)) {
			const reason = abortReason(abortSignals);
			return {
				result: createRunnerSubagentCancelledResult({
					title: intent.title,
					...(reason === undefined ? {} : { reason }),
				}),
				definition,
				launchPlan,
			};
		}

		const childPrompt = composePiAgentPrompt(definition, {
			title: intent.title,
			prompt: intent.prompt,
		});
		const baseOptions: RunnerSubagentOptions = {
			title: intent.title,
			prompt: childPrompt,
			returnMode: "final-text",
			tools: EXPLORER_READ_ONLY_TOOLS,
			...(intent.signal === undefined ? {} : { signal: intent.signal }),
			...(intent.onProgress === undefined ? {} : { onProgress: intent.onProgress }),
		};

		const firstResult = await dispatch(
			pi,
			ctx,
			launchPlan.kind === "cheap" ? { ...baseOptions, model: launchPlan.model } : baseOptions,
		);
		if (!shouldFailoverExplorerDispatch({ launchPlan, result: firstResult, abortSignals })) {
			return { result: firstResult, definition, launchPlan };
		}
		if (!isRunnerSubagentTransientFailureResult(firstResult)) {
			throw new Error("Explorer failover predicate accepted a non-transient result.");
		}

		const failoverResult = await dispatch(pi, ctx, baseOptions);
		return {
			result: failoverResult,
			definition,
			launchPlan,
			failover: {
				firstAttemptStatus: firstResult.status,
				firstAttemptDiagnostic: firstResult.diagnostic,
			},
		};
	};
}

export async function dispatchExplorerSubagent(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	intent: DispatchExplorerSubagentOptions,
): Promise<ExplorerDispatchOutcome> {
	return await defaultExplorerDispatcher(pi, ctx, intent);
}

interface ShouldFailoverExplorerDispatchInput {
	launchPlan: ExplorerLaunchPlan;
	result: RunnerSubagentResult;
	abortSignals: readonly AbortSignal[];
}

/**
 * Failover retries only infrastructure-shaped failures of the cheap model. Cancelled
 * runs honor the caller's intent, and stopped-without-* statuses mean the child ran but
 * produced unusable output — a prompt problem a different model will not fix.
 */
function shouldFailoverExplorerDispatch(input: ShouldFailoverExplorerDispatchInput): boolean {
	return (
		input.launchPlan.kind === "cheap" &&
		!input.abortSignals.some((signal) => signal.aborted) &&
		isRunnerSubagentTransientFailureResult(input.result)
	);
}

function explorerAbortSignals(
	ctx: RunnerSubagentContext,
	intent: DispatchExplorerSubagentOptions,
): AbortSignal[] {
	const signals: AbortSignal[] = [];
	for (const signal of [ctx.signal, intent.signal]) {
		if (signal !== undefined && !signals.includes(signal)) signals.push(signal);
	}
	return signals;
}

function abortReason(signals: readonly AbortSignal[]): string | undefined {
	for (const signal of signals) {
		if (!signal.aborted) continue;
		const reason = signal.reason as unknown;
		if (typeof reason === "string") return reason;
		if (reason instanceof Error) return reason.message;
		if (reason !== undefined) return String(reason);
	}
	return undefined;
}
