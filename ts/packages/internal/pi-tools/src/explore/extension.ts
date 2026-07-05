import { z } from "zod";

import { formatErrorMessage, formatZodError, optionalEntries } from "@ns/core/primitives";
import type { ScheduledTimer, TimerScheduler } from "@ns/core/timers";
import { loadPiAgentDefinition, type PiAgentDefinition } from "@ns/pi/runtime/agent-definition";
import { unrefTimerScheduler } from "@ns/pi/shared/timers";
import type { ToolContext, ToolDefinition, ToolResult } from "@ns/pi/runtime/tool-types";

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
	result?: RunnerSubagentResult;
	launchPlan?: ExplorerLaunchPlan;
	failover?: ExplorerDispatchOutcome["failover"];
	diagnostic?: string;
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
	description:
		"Launch 2+ read-only explorer subagents for parallel codebase reconnaissance and return ordered scout findings.",
	promptSnippet: "Launch parallel read-only explorer scouts for unknown codebase reconnaissance.",
	promptGuidelines: [
		"Use explore to launch 2+ read-only scout subagents for unknown codebase reconnaissance.",
		"Use explore only for reconnaissance; do not use explore for implementation, review verdicts, long-horizon planning, or tasks requiring bash, edits, or writes.",
		"Prefer direct read or grep over explore when you already know the exact file or symbol.",
		"For explore, give each task one focused question and concrete scope hints so parallel scouts do not overlap.",
		'For explore, choose breadth "quick" for two obvious angles, "medium" for a normal subsystem map, and "very-thorough" only for broad unfamiliar areas.',
	],
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
		promptGuidelines: ensureExploreGuidelines(metadata.promptGuidelines),
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
					input,
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
	return { definition };
}

function ensureExploreGuidelines(guidelines: readonly string[]): string[] {
	return guidelines.map((guideline) => {
		if (/\bexplore\b/u.test(guideline)) return guideline;
		return `For explore, ${guideline.charAt(0).toLowerCase()}${guideline.slice(1)}`;
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

async function runExploreTasks(input: {
	pi: RunnerSubagentPi;
	ctx: ToolContext;
	cwd: string;
	input: ExploreInput;
	maxConcurrency: number;
	signal: AbortSignal;
	dispatchExplorer: ExploreDispatchFunction;
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined;
}): Promise<ExploreTaskOutcome[]> {
	const states: ExploreTaskState[] = input.input.tasks.map((task) => ({
		input: task,
		state: "queued",
	}));
	const outcomes: Array<ExploreTaskOutcome | undefined> = Array.from({
		length: input.input.tasks.length,
	});
	const runnerCtx: RunnerSubagentContext = {
		cwd: input.cwd,
		...(input.ctx.model === undefined ? {} : { model: input.ctx.model }),
		signal: input.signal,
	};
	let nextIndex = 0;

	function emitProgress(): void {
		input.onUpdate?.({
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

	async function runNextTask(): Promise<void> {
		for (;;) {
			if (input.signal.aborted) return;
			const index = nextIndex;
			nextIndex += 1;
			const state = states[index];
			if (state === undefined) return;
			state.state = "running";
			emitProgress();
			const outcome = await runOneExploreTask({
				pi: input.pi,
				ctx: runnerCtx,
				index,
				state,
				signal: input.signal,
				dispatchExplorer: input.dispatchExplorer,
				onProgress: (update) => {
					state.latestUpdate = update;
					emitProgress();
				},
			});
			state.state = "done";
			state.outcome = outcome;
			outcomes[index] = outcome;
			emitProgress();
		}
	}

	const workerCount = Math.min(input.maxConcurrency, input.input.tasks.length);
	await Promise.all(Array.from({ length: workerCount }, () => runNextTask()));
	return outcomes.map((outcome, index) => {
		if (outcome !== undefined) return outcome;
		const title = input.input.tasks[index]?.title ?? `Task ${index + 1}`;
		return {
			index,
			title,
			diagnostic: abortReasonDiagnostic(input.signal, "Explore task was not started."),
			result: cancelledResult(title, input.signal),
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
			diagnostic,
			result: input.signal.aborted
				? cancelledResult(input.state.input.title, input.signal)
				: errorResult(input.state.input.title, diagnostic),
		};
	}
}

function exploreToolResult(
	input: ExploreInput,
	profile: (typeof EXPLORE_BREADTH_PROFILES)[ExploreBreadth],
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
	profile: (typeof EXPLORE_BREADTH_PROFILES)[ExploreBreadth],
	outcomes: readonly ExploreTaskOutcome[],
): ExploreToolDetails {
	const tasks = outcomes.map((outcome) => taskDetails(outcome, input.tasks.length));
	const finalTextCount = outcomes.filter(
		(outcome) => outcome.result?.status === "final-text",
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
	if (outcomes.some((outcome) => outcome.result?.status === "cancelled")) return "cancelled";
	return "failed";
}

function taskDetails(outcome: ExploreTaskOutcome, taskCount: number): ExploreTaskDetails {
	const result = outcome.result;
	if (result === undefined) {
		return {
			index: outcome.index,
			title: outcome.title,
			status: "configuration-error",
			...(outcome.diagnostic === undefined ? {} : { diagnostic: outcome.diagnostic }),
		};
	}
	const diagnostic = outcome.diagnostic ?? resultDiagnostic(result);
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
	profile: (typeof EXPLORE_BREADTH_PROFILES)[ExploreBreadth],
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
	profile: (typeof EXPLORE_BREADTH_PROFILES)[ExploreBreadth],
	outcomes: readonly ExploreTaskOutcome[],
	details: ExploreToolDetails,
): string {
	const finalTextCount = outcomes.filter(
		(outcome) => outcome.result?.status === "final-text",
	).length;
	const lines = [
		`explore result: ${finalTextCount}/${outcomes.length} scouts produced final text (breadth: ${input.breadth}, concurrency: ${profile.maxConcurrency})`,
	];
	for (const outcome of outcomes) {
		lines.push(
			"",
			`### ${outcome.index + 1}. ${outcome.title} — ${outcome.result?.status ?? "configuration-error"}`,
		);
		lines.push(
			`Session: ${outcome.result?.sessionFile ?? outcome.result?.progress.sessionFile ?? "unavailable"}`,
		);
		const diagnostic =
			outcome.diagnostic ??
			(outcome.result === undefined ? undefined : resultDiagnostic(outcome.result));
		if (outcome.result?.status === "final-text") {
			const excerpt = truncateExploreFinalText(outcome.result.finalText, input.tasks.length);
			lines.push("", excerpt.text);
			if (excerpt.truncated) {
				lines.push(
					"",
					`[Final text excerpt truncated to ${excerpt.text.length} of ${excerpt.originalChars} characters. Full text is in the child Pi session file above.]`,
				);
			}
		} else if (diagnostic !== undefined) {
			lines.push(`Diagnostic: ${diagnostic}`);
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
	if (state.outcome !== undefined)
		return `${state.input.title} ${state.outcome.result?.status ?? "error"}`;
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

function cancelledResult(title: string, signal: AbortSignal): RunnerSubagentResult {
	const diagnostic = abortReasonDiagnostic(signal, "Explore task was cancelled.");
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
