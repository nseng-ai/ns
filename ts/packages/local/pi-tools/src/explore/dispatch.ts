import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@sdl/pi/runtime/agent-definition";

import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentProgressCallback,
	type RunnerSubagentResult,
} from "../runner-subagents/extension-api.ts";
import { isProviderAuthConfiguredViaAuthStorage, type IsProviderAuthConfigured } from "./auth.ts";
import { EXPLORER_AGENT_NAME, EXPLORER_READ_ONLY_TOOLS } from "./contract.ts";
import { resolveExplorerLaunchPlan, type ExplorerLaunchPlan } from "./model-policy.ts";

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
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
	isProviderAuthConfigured?: IsProviderAuthConfigured;
	dispatchSubagent?: DispatchSubagentFn;
}

export interface ExplorerDispatchOutcome {
	result: RunnerSubagentResult;
	definition: PiAgentDefinition;
	launchPlan: ExplorerLaunchPlan;
	/** True when the cheap-model attempt failed at runtime and the parent model ran instead. */
	failedOver: boolean;
	firstAttemptDiagnostic?: string;
}

export async function dispatchExplorerSubagent(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: DispatchExplorerSubagentOptions,
): Promise<ExplorerDispatchOutcome> {
	const loadDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
	const definition = loadDefinition(EXPLORER_AGENT_NAME, options.cwd ?? ctx.cwd);
	const dispatch = options.dispatchSubagent ?? dispatchRunnerSubagent;
	const launchPlan = resolveExplorerLaunchPlan({
		...(ctx.model === undefined ? {} : { parentModel: ctx.model }),
		isProviderAuthConfigured:
			options.isProviderAuthConfigured ?? isProviderAuthConfiguredViaAuthStorage,
	});

	const childPrompt = composePiAgentPrompt(definition, {
		title: options.title,
		prompt: options.prompt,
	});
	const baseOptions: RunnerSubagentOptions = {
		title: options.title,
		prompt: childPrompt,
		returnMode: "final-text",
		tools: EXPLORER_READ_ONLY_TOOLS,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
	};

	const firstResult = await dispatch(
		pi,
		ctx,
		launchPlan.kind === "cheap" ? { ...baseOptions, model: launchPlan.model } : baseOptions,
	);
	if (
		launchPlan.kind !== "cheap" ||
		!isRuntimeFailoverEligible(firstResult) ||
		options.signal?.aborted === true
	) {
		return { result: firstResult, definition, launchPlan, failedOver: false };
	}

	const failoverResult = await dispatch(pi, ctx, baseOptions);
	return {
		result: failoverResult,
		definition,
		launchPlan,
		failedOver: true,
		firstAttemptDiagnostic: firstResult.diagnostic,
	};
}

/**
 * Failover retries only infrastructure-shaped failures of the cheap model. Cancelled
 * runs honor the caller's intent, and stopped-without-* statuses mean the child ran but
 * produced unusable text — a prompt problem a different model will not fix.
 */
function isRuntimeFailoverEligible(
	result: RunnerSubagentResult,
): result is Extract<RunnerSubagentResult, { status: "error" | "protocol-error" }> {
	return result.status === "error" || result.status === "protocol-error";
}
