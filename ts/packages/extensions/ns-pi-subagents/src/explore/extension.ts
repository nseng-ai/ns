import { formatErrorMessage, formatZodError } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { loadPiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";
import type { ToolContext, ToolDefinition, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import {
	mapWithConcurrency,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentUpdate,
} from "../runner-subagents/index.ts";
import {
	EXPLORE_ABSOLUTE_MAX_TASKS,
	EXPLORE_BREADTH_PROFILES,
	EXPLORE_BREADTH_VALUES,
	EXPLORE_MIN_TASKS,
	EXPLORE_TOOL_NAME,
	EXPLORER_AGENT_NAME,
	EXPLORER_AGENT_REPO_RELATIVE_PATH,
} from "./contract.ts";
import { dispatchExplorerSubagent } from "./dispatch.ts";
import {
	EXPLORE_PROMPT_MAX_CHARS,
	EXPLORE_TITLE_MAX_CHARS,
	exploreInputSchema,
	type ExploreInput,
} from "./input.ts";
import { SUBAGENT_FLEET_ENTRY_HINT } from "../fleet/display.ts";
import type { SubagentToolOptions, WithFleetRegistry } from "../fleet/tool-options.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import { trackSubagentFleetRun } from "../fleet/tracking.ts";
import { emitExploreProgress } from "./progress.ts";
import type { SubagentRuntime } from "../runtime/seam.ts";
import {
	checkAgentDefinitionConfiguration,
	type AgentDefinitionConfigurationCheck,
} from "../agent-configuration.ts";
import {
	abortReasonDiagnostic,
	cancelledResult,
	configurationErrorResult,
	errorResult,
	exploreToolResult,
} from "./result.ts";
import type { ExploreDispatchFunction, ExploreTaskOutcome, ExploreTaskState } from "./types.ts";

export type {
	ExploreDispatchFunction,
	ExploreTaskDetails,
	ExploreToolDetails,
	ExploreToolStatus,
} from "./types.ts";

export type ExploreExtensionAPI = RunnerSubagentPi & {
	registerTool(definition: ToolDefinition): void;
};

export interface ExploreExtensionOptions extends SubagentToolOptions {
	dispatchExplorer?: ExploreDispatchFunction;
	explorerRuntime?: SubagentRuntime;
	timers?: TimerScheduler;
}

interface ExploreAbortScope {
	signal: AbortSignal;
	dispose(): void;
}

export type { ExploreInput, ExploreTaskInput } from "./input.ts";

export const EXPLORE_PARAMETERS = {
	type: "object",
	properties: {
		breadth: {
			type: "string",
			enum: EXPLORE_BREADTH_VALUES,
			description:
				'Optional breadth profile. Use "quick" for one or two obvious angles, "medium" for a normal subsystem map, and "very-thorough" only for broad unfamiliar areas.',
		},
		tasks: {
			type: "array",
			minItems: EXPLORE_MIN_TASKS,
			maxItems: EXPLORE_ABSOLUTE_MAX_TASKS,
			description:
				"One or more focused read-only scout tasks. Each task should ask one concrete reconnaissance question with scope hints. A single task is appropriate for one deep standalone investigation question.",
			items: {
				type: "object",
				properties: {
					title: {
						type: "string",
						minLength: 1,
						maxLength: EXPLORE_TITLE_MAX_CHARS,
						description: "Short progress/result label for this explorer task.",
					},
					prompt: {
						type: "string",
						minLength: 1,
						maxLength: EXPLORE_PROMPT_MAX_CHARS,
						description:
							"Focused scout question with concrete scope hints. Do not ask explorers to edit files or run bash.",
					},
				},
				required: ["title", "prompt"],
				additionalProperties: false,
			},
		},
	},
	required: ["tasks"],
	additionalProperties: false,
} as const;

const FALLBACK_EXPLORER_TOOL_METADATA = {
	label: "Explorer",
	description: "explore is unavailable: explorer agent definition is misconfigured.",
	promptSnippet: "explore is unavailable until its explorer agent definition is fixed.",
	promptGuidelines: ["explore is unavailable until .ns/pi/agents/explorer.md is fixed."],
};

export function registerExploreTool(
	pi: ExploreExtensionAPI,
	options: WithFleetRegistry<ExploreExtensionOptions>,
): void {
	const loadAgentDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
	const timers = options.timers ?? unrefTimerScheduler;
	const registrationCheck = checkExplorerConfiguration(
		loadAgentDefinition,
		options.cwd ?? process.cwd(),
	);
	const metadata = registrationCheck.ok
		? registrationCheck.definition
		: FALLBACK_EXPLORER_TOOL_METADATA;
	const fleetRegistry = options.fleetRegistry;

	pi.registerTool({
		name: EXPLORE_TOOL_NAME,
		label: metadata.label,
		description: metadata.description,
		...(metadata.promptSnippet === undefined ? {} : { promptSnippet: metadata.promptSnippet }),
		promptGuidelines: metadata.promptGuidelines,
		parameters: EXPLORE_PARAMETERS,
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const input = validateExploreInput(params);
			const profile = EXPLORE_BREADTH_PROFILES[input.breadth];
			const request = { input, profile };
			const cwd = options.cwd ?? ctx.cwd;
			const configuration = checkExplorerConfiguration(loadAgentDefinition, cwd);
			if (!configuration.ok) {
				return configurationErrorResult(request, configuration.diagnostic);
			}

			const definition = configuration.definition;
			const dispatchExplorer =
				options.dispatchExplorer ??
				((childPi, childCtx, intent) =>
					dispatchExplorerSubagent({
						pi: childPi,
						ctx: childCtx,
						intent,
						definition,
						dependencies:
							options.explorerRuntime === undefined ? {} : { runtime: options.explorerRuntime },
					}));
			const abortScope = createExploreAbortScope(signal, profile.wallClockMs, timers);
			try {
				const outcomes = await runExploreTasks({
					pi,
					ctx,
					cwd,
					exploreInput: input,
					maxConcurrency: profile.maxConcurrency,
					signal: abortScope.signal,
					dispatchExplorer,
					onUpdate,
					fleetRegistry,
				});
				return exploreToolResult(request, outcomes);
			} finally {
				abortScope.dispose();
			}
		},
	});
}

function validateExploreInput(params: unknown): ExploreInput {
	const parsed = exploreInputSchema.safeParse(params);
	if (!parsed.success) throw new Error(formatZodError(parsed.error));
	return parsed.data;
}

function checkExplorerConfiguration(
	loadAgentDefinition: NonNullable<ExploreExtensionOptions["loadAgentDefinition"]>,
	cwd: string,
): AgentDefinitionConfigurationCheck {
	return checkAgentDefinitionConfiguration({
		agentName: EXPLORER_AGENT_NAME,
		cwd,
		toolName: EXPLORE_TOOL_NAME,
		loadAgentDefinition,
		requiredFilePath: EXPLORER_AGENT_REPO_RELATIVE_PATH,
		validateDefinition: (definition) => {
			const guidelineIndexesMissingExplore = definition.promptGuidelines
				.map((guideline, index) => (/\bexplore\b/u.test(guideline) ? undefined : index + 1))
				.filter((index) => index !== undefined);
			if (guidelineIndexesMissingExplore.length === 0) return undefined;
			return `${definition.filePath} promptGuidelines must mention "explore" in every guideline; missing guideline index(es): ${guidelineIndexesMissingExplore.join(", ")}.`;
		},
	});
}

function createExploreAbortScope(
	parentSignal: AbortSignal | undefined,
	wallClockMs: number,
	timers: TimerScheduler,
): ExploreAbortScope {
	const controller = new AbortController();
	let timeout: ScheduledTimer | undefined;

	function abort(reason: unknown): void {
		if (!controller.signal.aborted) controller.abort(reason);
	}

	const onParentAbort = (): void => abort(parentSignal?.reason ?? "explore parent signal aborted");
	if (parentSignal?.aborted) {
		onParentAbort();
	} else if (parentSignal !== undefined) {
		parentSignal.addEventListener("abort", onParentAbort, { once: true });
	}

	timeout = timers.setTimeout(() => {
		abort(`explore wall-clock limit exceeded after ${wallClockMs}ms`);
	}, wallClockMs);

	return {
		signal: controller.signal,
		dispose() {
			timeout?.cancel();
			if (parentSignal !== undefined) {
				parentSignal.removeEventListener("abort", onParentAbort);
			}
		},
	};
}

async function runExploreTasks(request: {
	pi: RunnerSubagentPi;
	ctx: ToolContext;
	cwd: string;
	exploreInput: ExploreInput;
	maxConcurrency: number;
	signal: AbortSignal;
	dispatchExplorer: ExploreDispatchFunction;
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined;
	fleetRegistry: SubagentFleetRegistry;
}): Promise<ExploreTaskOutcome[]> {
	const states: ExploreTaskState[] = request.exploreInput.tasks.map((task) => ({
		input: task,
		state: "queued",
	}));
	const runnerCtx: RunnerSubagentContext = {
		cwd: request.cwd,
		...(request.ctx.model === undefined ? {} : { model: request.ctx.model }),
		signal: request.signal,
	};
	const fleetTracking = trackSubagentFleetRun({
		registry: request.fleetRegistry,
		ctx: request.ctx,
		tasks: request.exploreInput.tasks,
		parentSessionFile: request.ctx.sessionManager?.getSessionFile?.(),
	});

	function emitProgress(): void {
		emitExploreProgress(states, request.onUpdate);
	}

	try {
		emitProgress();

		const outcomes = await mapWithConcurrency({
			items: states,
			maxConcurrency: request.maxConcurrency,
			signal: request.signal,
			run: async (state, index) => {
				state.state = "running";
				fleetTracking.markRunning(index);
				emitProgress();
				const outcome = await runOneExploreTask({
					pi: request.pi,
					ctx: runnerCtx,
					index,
					state,
					signal: request.signal,
					dispatchExplorer: request.dispatchExplorer,
					onProgress: (update) => {
						state.latestUpdate = update;
						fleetTracking.markProgress(index, update);
						emitProgress();
					},
				});
				state.state = "done";
				state.outcome = outcome;
				fleetTracking.markDone(index, outcome.result);
				emitProgress();
				return outcome;
			},
		});

		const finalOutcomes = outcomes.map((outcome, index) => {
			if (outcome !== undefined) return outcome;
			const title = request.exploreInput.tasks[index]?.title ?? `Task ${index + 1}`;
			return {
				index,
				title,
				result: cancelledResult(title, request.signal, "Explore task was not started."),
			};
		});
		notifyExploreAbnormalEnd(request.ctx, finalOutcomes);
		return finalOutcomes;
	} finally {
		fleetTracking.dispose();
	}
}

function notifyExploreAbnormalEnd(ctx: ToolContext, outcomes: readonly ExploreTaskOutcome[]): void {
	if (!ctx.hasUI) return;
	const unfinished = outcomes.filter((outcome) => outcome.result.status !== "final-text").length;
	if (unfinished === 0) return;
	try {
		ctx.ui.notify(
			`explore: ${unfinished} of ${outcomes.length} tasks did not finish cleanly — ${SUBAGENT_FLEET_ENTRY_HINT}`,
			"warning",
		);
	} catch {
		// Notifications are display-only and must not affect explore results.
	}
}

async function runOneExploreTask(input: {
	pi: RunnerSubagentPi;
	ctx: RunnerSubagentContext;
	index: number;
	state: ExploreTaskState;
	signal: AbortSignal;
	dispatchExplorer: ExploreDispatchFunction;
	onProgress(update: RunnerSubagentUpdate): void;
}): Promise<ExploreTaskOutcome> {
	try {
		const outcome = await input.dispatchExplorer(input.pi, input.ctx, {
			title: input.state.input.title,
			prompt: input.state.input.prompt,
			signal: input.signal,
			onProgress: input.onProgress,
		});
		return {
			index: input.index,
			title: input.state.input.title,
			result: outcome.result,
			launchPlan: outcome.launchPlan,
			...(outcome.failover === undefined ? {} : { failover: outcome.failover }),
		};
	} catch (error) {
		const diagnostic = input.signal.aborted
			? abortReasonDiagnostic(input.signal, "Explore task was aborted.")
			: `Explorer dispatch failed: ${formatErrorMessage(error)}`;
		return {
			index: input.index,
			title: input.state.input.title,
			result: input.signal.aborted
				? cancelledResult(input.state.input.title, input.signal)
				: errorResult(input.state.input.title, diagnostic),
		};
	}
}
