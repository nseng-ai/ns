import { z } from "zod";

import { formatErrorMessage, formatZodError, optionalEntries } from "@ns/core/primitives";
import type { ScheduledTimer, TimerScheduler } from "@ns/core/timers";
import { loadPiAgentDefinition, type PiAgentDefinition } from "@ns/pi/runtime/agent-definition";
import { unrefTimerScheduler } from "@ns/pi/shared/timers";
import type { ToolContext, ToolDefinition, ToolResult } from "@ns/pi/runtime/tool-types";

import { mapWithConcurrency } from "../runner-subagents/concurrency.ts";
import {
	resultDiagnostic,
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
	type RunnerSubagentUsageMetadata,
} from "../runner-subagents/extension-api.ts";
import {
	EXPLORE_ABSOLUTE_MAX_TASKS,
	EXPLORE_BREADTH_PROFILES,
	EXPLORE_BREADTH_VALUES,
	EXPLORE_INTERIM_PER_TASK_FINAL_TEXT_CAP_CHARS,
	EXPLORE_INTERIM_TOTAL_FINAL_TEXT_CAP_CHARS,
	EXPLORE_TOOL_NAME,
	EXPLORER_AGENT_NAME,
	EXPLORER_AGENT_REPO_RELATIVE_PATH,
	type ExploreBreadth,
	type ExploreBreadthProfile,
} from "./contract.ts";
import {
	dispatchExplorerSubagent,
	type DispatchExplorerSubagentOptions,
	type ExplorerDispatchOutcome,
} from "./dispatch.ts";
import type { ExplorerLaunchPlan } from "./model-policy.ts";

export type ExploreExtensionAPI = RunnerSubagentPi & {
	registerTool(definition: ToolDefinition): void;
};

export type ExploreDispatchFunction = (
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	intent: DispatchExplorerSubagentOptions,
) => Promise<ExplorerDispatchOutcome>;

export interface ExploreExtensionOptions {
	cwd?: string;
	dispatchExplorer?: ExploreDispatchFunction;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
	timers?: TimerScheduler;
}

export type ExploreToolStatus =
	| "completed"
	| "partial"
	| "failed"
	| "cancelled"
	| "configuration-error";

export interface ExploreTaskDetails {
	index: number;
	title: string;
	status: RunnerSubagentResult["status"] | "configuration-error";
	elapsedMs?: number;
	sessionFile?: string;
	launchPlan?: ExplorerLaunchPlan;
	failover?: ExplorerDispatchOutcome["failover"];
	usage?: RunnerSubagentUsageMetadata;
	finalTextChars?: number;
	finalTextTruncated?: boolean;
	diagnostic?: string;
}

export interface ExploreToolDetails {
	status: ExploreToolStatus;
	breadth: ExploreBreadth;
	taskCount: number;
	maxConcurrency: number;
	wallClockMs: number;
	tasks: ExploreTaskDetails[];
}

interface ExploreTaskOutcome {
	index: number;
	title: string;
	result: RunnerSubagentResult;
	launchPlan?: ExplorerLaunchPlan;
	failover?: ExplorerDispatchOutcome["failover"];
}

interface ExploreTaskState {
	input: ExploreTaskInput;
	state: "queued" | "running" | "done";
	latestUpdate?: RunnerSubagentUpdate;
	outcome?: ExploreTaskOutcome;
}

interface ExploreConfigurationCheck {
	definition?: PiAgentDefinition;
	diagnostic?: string;
}

interface ExploreAbortScope {
	signal: AbortSignal;
	dispose(): void;
}

const EXPLORE_DEFAULT_BREADTH: ExploreBreadth = "medium";
const EXPLORE_TITLE_MAX_CHARS = 120;
const EXPLORE_PROMPT_MAX_CHARS = 4_000;

const exploreInputSchema = z
	.object({
		breadth: z.enum(EXPLORE_BREADTH_VALUES).default(EXPLORE_DEFAULT_BREADTH),
		tasks: z
			.array(
				z.object({
					title: z.string().trim().min(1).max(EXPLORE_TITLE_MAX_CHARS),
					prompt: z.string().trim().min(1).max(EXPLORE_PROMPT_MAX_CHARS),
				}),
			)
			.min(2)
			.max(EXPLORE_ABSOLUTE_MAX_TASKS),
	})
	.strict()
	.superRefine((input, ctx) => {
		const profile = EXPLORE_BREADTH_PROFILES[input.breadth];
		if (input.tasks.length > profile.maxTasks) {
			ctx.addIssue({
				code: "custom",
				path: ["tasks"],
				message: `Too many explore tasks for breadth "${input.breadth}": got ${input.tasks.length}, max ${profile.maxTasks}. Choose a larger breadth or fewer tasks.`,
			});
		}
	});

export type ExploreInput = z.infer<typeof exploreInputSchema>;
export type ExploreTaskInput = ExploreInput["tasks"][number];

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
	const metadata = registrationCheck.definition ?? FALLBACK_EXPLORER_TOOL_METADATA;

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
			const cwd = options.cwd ?? ctx.cwd;
			const configuration = checkExplorerConfiguration(loadAgentDefinition, cwd);
			if (configuration.definition === undefined) {
				return configurationErrorResult(
					input,
					profile,
					configuration.diagnostic ?? "unknown error",
				);
			}

			const definition = configuration.definition;
			const dispatchExplorer =
				options.dispatchExplorer ??
				((childPi, childCtx, intent) =>
					dispatchExplorerSubagent(childPi, childCtx, intent, {
						loadAgentDefinition: () => definition,
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
				});
				return exploreToolResult(input, profile, outcomes);
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
			diagnostic: `${EXPLORER_AGENT_REPO_RELATIVE_PATH} is required for explore but could not be loaded: ${formatErrorMessage(error)}`,
		};
	}
	if (definition.toolName !== EXPLORE_TOOL_NAME) {
		return {
			diagnostic: `${definition.filePath} declares toolName "${definition.toolName}"; expected "${EXPLORE_TOOL_NAME}".`,
		};
	}
	const guidelinesMissingToolName = definition.promptGuidelines
		.map((guideline, index) => (/\bexplore\b/u.test(guideline) ? undefined : index + 1))
		.filter((index) => index !== undefined);
	if (guidelinesMissingToolName.length > 0) {
		return {
			diagnostic: `${definition.filePath} promptGuidelines must mention "explore" in every guideline; missing guideline index(es): ${guidelinesMissingToolName.join(", ")}.`,
		};
	}
	return { definition };
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

	function emitProgress(): void {
		request.onUpdate?.({
			content: [{ type: "text", text: renderExploreProgress(states) }],
			details: {
				status: "running",
				done: states.filter((state) => state.state === "done").length,
				running: states.filter((state) => state.state === "running").length,
				taskCount: states.length,
			},
		});
	}

	emitProgress();

	const outcomes = await mapWithConcurrency({
		items: states,
		maxConcurrency: request.maxConcurrency,
		signal: request.signal,
		run: async (state, index) => {
			state.state = "running";
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
					emitProgress();
				},
			});
			state.state = "done";
			state.outcome = outcome;
			emitProgress();
			return outcome;
		},
	});

	return outcomes.map((outcome, index) => {
		if (outcome !== undefined) return outcome;
		const title = request.exploreInput.tasks[index]?.title ?? `Task ${index + 1}`;
		return {
			index,
			title,
			result: cancelledResult(title, request.signal, "Explore task was not started."),
		};
	});
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
			cwd: input.ctx.cwd,
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

function exploreToolResult(
	input: ExploreInput,
	profile: ExploreBreadthProfile,
	outcomes: readonly ExploreTaskOutcome[],
): ToolResult<ExploreToolDetails> {
	const details = buildExploreToolDetails(input, profile, outcomes);
	return {
		content: [{ type: "text", text: formatExploreResultText(input, profile, outcomes, details) }],
		details,
		...(details.status === "failed" || details.status === "cancelled" ? { isError: true } : {}),
	};
}

function buildExploreToolDetails(
	input: ExploreInput,
	profile: ExploreBreadthProfile,
	outcomes: readonly ExploreTaskOutcome[],
): ExploreToolDetails {
	const tasks = outcomes.map((outcome) => taskDetails(outcome, input.tasks.length));
	const finalTextCount = outcomes.filter(
		(outcome) => outcome.result.status === "final-text",
	).length;
	const status = summarizeExploreToolStatus(outcomes, finalTextCount);
	return {
		status,
		breadth: input.breadth,
		taskCount: input.tasks.length,
		maxConcurrency: profile.maxConcurrency,
		wallClockMs: profile.wallClockMs,
		tasks,
	};
}

function summarizeExploreToolStatus(
	outcomes: readonly ExploreTaskOutcome[],
	finalTextCount: number,
): ExploreToolStatus {
	if (finalTextCount === outcomes.length) return "completed";
	if (finalTextCount > 0) return "partial";
	if (outcomes.some((outcome) => outcome.result.status === "cancelled")) return "cancelled";
	return "failed";
}

function taskDetails(outcome: ExploreTaskOutcome, taskCount: number): ExploreTaskDetails {
	const result = outcome.result;
	const diagnostic = resultDiagnostic(result);
	const finalTextExcerpt =
		result.status === "final-text"
			? truncateExploreFinalText(result.finalText, taskCount)
			: undefined;
	return {
		index: outcome.index,
		title: outcome.title,
		status: result.status,
		elapsedMs: result.elapsedMs,
		...optionalEntries({
			sessionFile: result.sessionFile ?? result.progress.sessionFile,
			launchPlan: outcome.launchPlan,
			failover: outcome.failover,
			usage: result.usage,
			diagnostic,
		}),
		...(finalTextExcerpt === undefined
			? {}
			: {
					finalTextChars: finalTextExcerpt.originalChars,
					finalTextTruncated: finalTextExcerpt.truncated,
				}),
	};
}

function configurationErrorResult(
	input: ExploreInput,
	profile: ExploreBreadthProfile,
	diagnostic: string,
): ToolResult<ExploreToolDetails> {
	return {
		content: [
			{
				type: "text",
				text: [
					"explore is unavailable because its explorer agent definition is misconfigured.",
					`Expected ${EXPLORER_AGENT_REPO_RELATIVE_PATH} to exist and declare toolName: ${EXPLORE_TOOL_NAME}.`,
					`Diagnostic: ${diagnostic}`,
				].join("\n"),
			},
		],
		details: {
			status: "configuration-error",
			breadth: input.breadth,
			taskCount: input.tasks.length,
			maxConcurrency: profile.maxConcurrency,
			wallClockMs: profile.wallClockMs,
			tasks: input.tasks.map((task, index) => ({
				index,
				title: task.title,
				status: "configuration-error",
				diagnostic,
			})),
		},
		isError: true,
	};
}

function formatExploreResultText(
	input: ExploreInput,
	profile: ExploreBreadthProfile,
	outcomes: readonly ExploreTaskOutcome[],
	details: ExploreToolDetails,
): string {
	const finalTextCount = details.tasks.filter((task) => task.status === "final-text").length;
	const lines = [
		`explore result: ${finalTextCount}/${details.taskCount} scouts produced final text (breadth: ${input.breadth}, concurrency: ${profile.maxConcurrency})`,
	];
	for (const outcome of outcomes) {
		const detail = details.tasks[outcome.index];
		const status = detail?.status ?? outcome.result.status;
		const sessionFile =
			detail?.sessionFile ?? outcome.result.sessionFile ?? outcome.result.progress.sessionFile;
		lines.push("", `### ${outcome.index + 1}. ${outcome.title} — ${status}`);
		lines.push(`Session: ${sessionFile ?? "unavailable"}`);
		if (outcome.result.status === "final-text") {
			const excerpt = truncateExploreFinalText(outcome.result.finalText, input.tasks.length);
			lines.push("", excerpt.text);
			if (excerpt.truncated) {
				lines.push(
					"",
					`[Final text excerpt truncated to ${excerpt.text.length} of ${excerpt.originalChars} characters. Full text is in the child Pi session file above.]`,
				);
			}
		} else if (detail?.diagnostic !== undefined) {
			lines.push(`Diagnostic: ${detail.diagnostic}`);
		}
	}
	if (details.status === "failed" || details.status === "cancelled") {
		lines.push(
			"",
			"No explorer scout produced usable final text. Inspect diagnostics/session files before relying on this result.",
		);
	}
	return lines.join("\n");
}

function truncateExploreFinalText(
	text: string,
	taskCount: number,
): {
	text: string;
	truncated: boolean;
	originalChars: number;
} {
	const originalChars = text.length;
	const perTaskBudget = Math.min(
		EXPLORE_INTERIM_PER_TASK_FINAL_TEXT_CAP_CHARS,
		Math.floor(EXPLORE_INTERIM_TOTAL_FINAL_TEXT_CAP_CHARS / taskCount),
	);
	if (originalChars <= perTaskBudget) return { text, truncated: false, originalChars };
	return { text: text.slice(0, perTaskBudget), truncated: true, originalChars };
}

function renderExploreProgress(states: readonly ExploreTaskState[]): string {
	const done = states.filter((state) => state.state === "done").length;
	const running = states.filter((state) => state.state === "running").length;
	const summaries = states.map(renderExploreTaskProgress).join("; ");
	return compactProgress(
		`explore: ${done}/${states.length} done, ${running} running — ${summaries}`,
	);
}

function renderExploreTaskProgress(state: ExploreTaskState): string {
	if (state.outcome !== undefined) return `${state.input.title} ${state.outcome.result.status}`;
	if (state.state === "queued") return `${state.input.title} queued`;
	const update = state.latestUpdate;
	const progress = update?.progress;
	const preview =
		update === undefined ? undefined : runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined && progress !== undefined)
		return `${state.input.title} ${progress.state}: ${preview}`;
	if (progress?.currentTool !== undefined)
		return `${state.input.title} ${progress.state} ${progress.currentTool}`;
	if (progress !== undefined && progress.turnCount > 0)
		return `${state.input.title} ${progress.state} turn ${progress.turnCount}`;
	return `${state.input.title} running`;
}

function compactProgress(text: string): string {
	const limit = 320;
	if (text.length <= limit) return text;
	return `${text.slice(0, limit - 1)}…`;
}

function cancelledResult(
	title: string,
	signal: AbortSignal,
	fallback = "Explore task was cancelled.",
): RunnerSubagentResult {
	const diagnostic = abortReasonDiagnostic(signal, fallback);
	return {
		status: "cancelled",
		title,
		diagnostic,
		...optionalEntries({ reason: abortReasonText(signal) }),
		elapsedMs: 0,
		progress: { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
	};
}

function errorResult(title: string, diagnostic: string): RunnerSubagentResult {
	return {
		status: "error",
		title,
		diagnostic,
		error: { message: diagnostic },
		elapsedMs: 0,
		progress: { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
	};
}

function abortReasonDiagnostic(signal: AbortSignal, fallback: string): string {
	const reason = abortReasonText(signal);
	return reason === undefined ? fallback : reason;
}

function abortReasonText(signal: AbortSignal): string | undefined {
	if (!signal.aborted) return undefined;
	const reason = signal.reason;
	if (reason === undefined) return undefined;
	if (typeof reason === "string") return reason;
	return formatErrorMessage(reason);
}
