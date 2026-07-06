import { formatErrorMessage, formatZodError } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import {
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";
import type { ToolContext, ToolDefinition, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import {
	RunnerSubagentFleetRegistry,
	mapWithConcurrency,
	setRunnerSubagentWidget,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";
import {
	EXPLORE_ABSOLUTE_MAX_TASKS,
	EXPLORE_BREADTH_PROFILES,
	EXPLORE_BREADTH_VALUES,
	EXPLORE_FLEET_COMMAND_NAME,
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
import { syncExploreFleetDisplay } from "./fleet.ts";
import { registerExploreFleetCommand } from "./fleet-navigator.ts";
import { emitExploreProgress, EXPLORE_PROGRESS_WIDGET_KEY } from "./progress.ts";
import type { ExplorerRuntime } from "./runtime.ts";
import {
	registerExploreTranscriptCommand,
	type CommandRegistrar,
	type TranscriptViewerDependencies,
} from "./transcript-viewer.ts";
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
	registerCommand?: CommandRegistrar;
};

export interface ExploreExtensionOptions {
	cwd?: string;
	dispatchExplorer?: ExploreDispatchFunction;
	explorerRuntime?: ExplorerRuntime;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
	timers?: TimerScheduler;
	transcriptViewer?: TranscriptViewerDependencies;
}

type ExploreConfigurationCheck =
	| { ok: true; definition: PiAgentDefinition }
	| { ok: false; diagnostic: string };

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
				'Optional breadth profile. Use "quick" for two obvious angles, "medium" for a normal subsystem map, and "very-thorough" only for broad unfamiliar areas.',
		},
		tasks: {
			type: "array",
			minItems: 2,
			maxItems: EXPLORE_ABSOLUTE_MAX_TASKS,
			description:
				"Two or more focused read-only scout tasks. Each task should ask one concrete reconnaissance question with scope hints.",
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

export default function exploreExtension(
	pi: ExploreExtensionAPI,
	options: ExploreExtensionOptions = {},
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
	const fleetRegistry = new RunnerSubagentFleetRegistry();
	registerExploreTranscriptCommand({
		pi,
		registry: fleetRegistry,
		...(options.transcriptViewer === undefined ? {} : { dependencies: options.transcriptViewer }),
	});
	registerExploreFleetCommand({
		pi,
		registry: fleetRegistry,
	});

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
	loadAgentDefinition: (agentName: string, cwd: string) => PiAgentDefinition,
	cwd: string,
): ExploreConfigurationCheck {
	let definition: PiAgentDefinition;
	try {
		definition = loadAgentDefinition(EXPLORER_AGENT_NAME, cwd);
	} catch (error) {
		return {
			ok: false,
			diagnostic: `${EXPLORER_AGENT_REPO_RELATIVE_PATH} is required for explore but could not be loaded: ${formatErrorMessage(error)}`,
		};
	}
	if (definition.toolName !== EXPLORE_TOOL_NAME) {
		return {
			ok: false,
			diagnostic: `${definition.filePath} declares toolName "${definition.toolName}"; expected "${EXPLORE_TOOL_NAME}".`,
		};
	}
	const guidelineIndexesMissingExplore = definition.promptGuidelines
		.map((guideline, index) => (/\bexplore\b/u.test(guideline) ? undefined : index + 1))
		.filter((index) => index !== undefined);
	if (guidelineIndexesMissingExplore.length > 0) {
		return {
			ok: false,
			diagnostic: `${definition.filePath} promptGuidelines must mention "explore" in every guideline; missing guideline index(es): ${guidelineIndexesMissingExplore.join(", ")}.`,
		};
	}
	return { ok: true, definition };
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
	fleetRegistry: RunnerSubagentFleetRegistry;
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
	const fleetRun = request.fleetRegistry.startRun(request.exploreInput.tasks);
	const unsubscribeFleet = request.fleetRegistry.subscribe(() => {
		syncExploreFleetDisplay(request.ctx, request.fleetRegistry.snapshot());
	});
	syncExploreFleetDisplay(request.ctx, request.fleetRegistry.snapshot());

	function emitProgress(): void {
		emitExploreProgress(request.ctx, states, request.onUpdate);
	}

	try {
		emitProgress();

		const outcomes = await mapWithConcurrency({
			items: states,
			maxConcurrency: request.maxConcurrency,
			signal: request.signal,
			run: async (state, index) => {
				const fleetTaskId = fleetRun.tasks[index]?.id;
				state.state = "running";
				request.fleetRegistry.markRunning(fleetTaskId);
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
						request.fleetRegistry.markProgress(fleetTaskId, update);
						emitProgress();
					},
				});
				state.state = "done";
				state.outcome = outcome;
				request.fleetRegistry.markDone(fleetTaskId, outcome.result);
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
		unsubscribeFleet();
		setRunnerSubagentWidget(request.ctx, EXPLORE_PROGRESS_WIDGET_KEY, undefined);
	}
}

function notifyExploreAbnormalEnd(ctx: ToolContext, outcomes: readonly ExploreTaskOutcome[]): void {
	if (!ctx.hasUI) return;
	const unfinished = outcomes.filter((outcome) => outcome.result.status !== "final-text").length;
	if (unfinished === 0) return;
	try {
		ctx.ui.notify(
			`explore: ${unfinished} of ${outcomes.length} tasks did not finish cleanly — /${EXPLORE_FLEET_COMMAND_NAME} to inspect`,
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
