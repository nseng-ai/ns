import { z } from "zod";

import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import {
	formatErrorMessage,
	formatZodError,
	optionalEntries,
} from "@nseng-ai/foundation/primitives";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import {
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";
import type { ToolContext, ToolDefinition, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

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
import { setRunnerSubagentWidget } from "../runner-subagents/widget.ts";
import {
	EXPLORE_ABSOLUTE_MAX_TASKS,
	EXPLORE_BREADTH_PROFILES,
	EXPLORE_BREADTH_VALUES,
	EXPLORE_DIRECT_RESULT_PER_TASK_CAP_CHARS,
	EXPLORE_DIRECT_RESULT_TOTAL_CAP_CHARS,
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
	isFinalTextTruncated?: boolean;
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

interface ExploreProgressDetails {
	status: "running";
	done: number;
	running: number;
	taskCount: number;
}

const EXPLORE_DEFAULT_BREADTH: ExploreBreadth = "medium";
const EXPLORE_PROGRESS_WIDGET_KEY = "ns.explore.progress";
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
			const request = { input, profile };
			const cwd = options.cwd ?? ctx.cwd;
			const configuration = checkExplorerConfiguration(loadAgentDefinition, cwd);
			if (configuration.definition === undefined) {
				return configurationErrorResult(
					request,
					configuration.diagnostic ?? "unknown error",
				);
			}

			const definition = configuration.definition;
			const dispatchExplorer =
				options.dispatchExplorer ??
				((childPi, childCtx, intent) =>
					dispatchExplorerSubagent({
						pi: childPi,
						ctx: childCtx,
						intent,
						dependencies: { loadAgentDefinition: () => definition },
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
			diagnostic: `${EXPLORER_AGENT_REPO_RELATIVE_PATH} is required for explore but could not be loaded: ${formatErrorMessage(error)}`,
		};
	}
	if (definition.toolName !== EXPLORE_TOOL_NAME) {
		return {
			diagnostic: `${definition.filePath} declares toolName "${definition.toolName}"; expected "${EXPLORE_TOOL_NAME}".`,
		};
	}
	const guidelineIndexesMissingExplore = definition.promptGuidelines
		.map((guideline, index) => (/\bexplore\b/u.test(guideline) ? undefined : index + 1))
		.filter((index) => index !== undefined);
	if (guidelineIndexesMissingExplore.length > 0) {
		return {
			diagnostic: `${definition.filePath} promptGuidelines must mention "explore" in every guideline; missing guideline index(es): ${guidelineIndexesMissingExplore.join(", ")}.`,
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
		emitExploreProgress(request.ctx, states, request.onUpdate);
	}

	try {
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
	} finally {
		setRunnerSubagentWidget(request.ctx, EXPLORE_PROGRESS_WIDGET_KEY, undefined);
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

interface ExploreRequest {
	input: ExploreInput;
	profile: ExploreBreadthProfile;
}

function exploreToolResult(
	input: ExploreInput,
	profile: ExploreBreadthProfile,
	outcomes: readonly ExploreTaskOutcome[],
): ToolResult<ExploreToolDetails> {
	const request = { input, profile };
	const finalTextCount = countFinalTextOutcomes(outcomes);
	const { details, finalTextExcerpts } = buildExploreToolDetails(request, outcomes, finalTextCount);
	return {
		content: [{ type: "text", text: formatExploreResultText(details, finalTextExcerpts) }],
		details,
		...(details.status === "failed" || details.status === "cancelled" ? { isError: true } : {}),
	};
}

interface ExploreToolDetailsBuildResult {
	details: ExploreToolDetails;
	finalTextExcerpts: ReadonlyArray<TruncatedExploreText | undefined>;
}

function buildExploreToolDetails(
	request: ExploreRequest,
	outcomes: readonly ExploreTaskOutcome[],
	finalTextCount: number,
): ExploreToolDetailsBuildResult {
	const taskResults = outcomes.map((outcome) => taskDetails(outcome, request.input.tasks.length));
	const status = summarizeExploreToolStatus(outcomes, finalTextCount);
	return {
		details: {
			status,
			breadth: request.input.breadth,
			taskCount: request.input.tasks.length,
			maxConcurrency: request.profile.maxConcurrency,
			wallClockMs: request.profile.wallClockMs,
			tasks: taskResults.map((result) => result.detail),
		},
		finalTextExcerpts: taskResults.map((result) => result.finalTextExcerpt),
	};
}

function countFinalTextOutcomes(outcomes: readonly ExploreTaskOutcome[]): number {
	return outcomes.filter((outcome) => outcome.result.status === "final-text").length;
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

interface ExploreTaskDetailsBuildResult {
	detail: ExploreTaskDetails;
	finalTextExcerpt?: TruncatedExploreText;
}

function taskDetails(
	outcome: ExploreTaskOutcome,
	taskCount: number,
): ExploreTaskDetailsBuildResult {
	const result = outcome.result;
	const diagnostic = resultDiagnostic(result);
	const finalTextExcerpt =
		result.status === "final-text"
			? truncateExploreDirectResultText(result.finalText, taskCount)
			: undefined;
	return {
		detail: {
			index: outcome.index,
			title: outcome.title,
			status: result.status,
			elapsedMs: result.elapsedMs,
			...optionalEntries({
				sessionFile: sessionFileFor(result),
				launchPlan: outcome.launchPlan,
				failover: outcome.failover,
				usage: result.usage,
				diagnostic,
			}),
			...(finalTextExcerpt === undefined
				? {}
				: {
						finalTextChars: finalTextExcerpt.originalChars,
						isFinalTextTruncated: finalTextExcerpt.truncated,
					}),
		},
		...optionalEntries({ finalTextExcerpt }),
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
	details: ExploreToolDetails,
	finalTextExcerpts: ReadonlyArray<TruncatedExploreText | undefined>,
): string {
	const finalTextCount = details.tasks.filter((task) => task.status === "final-text").length;
	const lines = [
		`explore result: ${finalTextCount}/${details.taskCount} scouts produced final text (breadth: ${details.breadth}, concurrency: ${details.maxConcurrency})`,
	];
	for (const [taskIndex, detail] of details.tasks.entries()) {
		const excerpt = finalTextExcerpts[taskIndex];
		lines.push("", `### ${detail.index + 1}. ${detail.title} — ${detail.status}`);
		lines.push(`Session: ${detail.sessionFile ?? "unavailable"}`);
		if (excerpt !== undefined) {
			lines.push("", excerpt.text);
			if (excerpt.truncated) {
				lines.push(
					"",
					`[Scout findings truncated to ${excerpt.text.length} of ${excerpt.originalChars} characters for parent-context size. Full raw child output is available in the child Pi session file above.]`,
				);
			}
		} else if (detail.diagnostic !== undefined) {
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

interface TruncatedExploreText {
	text: string;
	truncated: boolean;
	originalChars: number;
}

function truncateExploreDirectResultText(text: string, taskCount: number): TruncatedExploreText {
	const originalChars = text.length;
	const perTaskBudget = Math.min(
		EXPLORE_DIRECT_RESULT_PER_TASK_CAP_CHARS,
		Math.floor(EXPLORE_DIRECT_RESULT_TOTAL_CAP_CHARS / taskCount),
	);
	const truncatedText = truncateTextHead({
		value: text,
		maxChars: perTaskBudget,
		buildMarker: () => "",
		shouldTrimHead: false,
	});
	return { text: truncatedText, truncated: truncatedText.length < originalChars, originalChars };
}

function sessionFileFor(result: RunnerSubagentResult): string | undefined {
	return result.sessionFile ?? result.progress.sessionFile;
}

function emitExploreProgress(
	ctx: ToolContext,
	states: readonly ExploreTaskState[],
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
): void {
	onUpdate?.({
		content: [{ type: "text", text: renderExploreProgress(states) }],
		details: exploreProgressDetails(states),
	});
	setRunnerSubagentWidget(
		ctx,
		EXPLORE_PROGRESS_WIDGET_KEY,
		formatExploreProgressWidgetLines(states),
	);
}

function exploreProgressDetails(states: readonly ExploreTaskState[]): ExploreProgressDetails {
	return {
		status: "running",
		done: states.filter((state) => state.state === "done").length,
		running: states.filter((state) => state.state === "running").length,
		taskCount: states.length,
	};
}

function formatExploreProgressWidgetLines(states: readonly ExploreTaskState[]): string[] {
	const details = exploreProgressDetails(states);
	return [
		`explore: ${details.done}/${details.taskCount} done, ${details.running} running`,
		...states.map((state, index) => formatExploreTaskWidgetLine(state, index)),
	];
}

interface ExploreTaskActivityDescription {
	text: string;
	isTurnCount: boolean;
}

interface ExploreTaskProgressDescription {
	icon: string;
	status: string;
	activity?: ExploreTaskActivityDescription;
}

function formatExploreTaskWidgetLine(state: ExploreTaskState, index: number): string {
	const description = describeExploreTaskProgress(state);
	const suffix = description.activity === undefined ? "" : ` — ${description.activity.text}`;
	return truncatePlain(
		`${description.icon} ${index + 1}. ${state.input.title} — ${description.status}${suffix}`,
		180,
	);
}

function describeExploreTaskProgress(state: ExploreTaskState): ExploreTaskProgressDescription {
	if (state.outcome !== undefined) {
		const sessionFile = sessionFileFor(state.outcome.result);
		return {
			icon: state.outcome.result.status === "final-text" ? "✓" : "✗",
			status: state.outcome.result.status,
			...optionalEntries({
				activity:
					sessionFile === undefined
						? undefined
						: {
								text: sessionFile,
								isTurnCount: false,
							},
			}),
		};
	}
	if (state.state === "queued") return { icon: "·", status: "queued" };

	const update = state.latestUpdate;
	if (update === undefined) return { icon: "▶", status: "running" };
	return {
		icon: "▶",
		status: update.progress.state,
		...optionalEntries({ activity: activityDescription(update) }),
	};
}

function activityDescription(
	update: RunnerSubagentUpdate,
): ExploreTaskActivityDescription | undefined {
	const preview = runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined) return { text: preview, isTurnCount: false };
	if (update.progress.currentTool !== undefined) {
		return { text: update.progress.currentTool, isTurnCount: false };
	}
	if (update.progress.turnCount > 0) {
		return { text: `turn ${update.progress.turnCount}`, isTurnCount: true };
	}
	return undefined;
}

function renderExploreProgress(states: readonly ExploreTaskState[]): string {
	const details = exploreProgressDetails(states);
	const summaries = states.map(renderExploreTaskProgress).join("; ");
	return truncatePlain(
		`explore: ${details.done}/${details.taskCount} done, ${details.running} running — ${summaries}`,
		320,
	);
}

function renderExploreTaskProgress(state: ExploreTaskState): string {
	const description = describeExploreTaskProgress(state);
	if (description.activity === undefined || state.outcome !== undefined)
		return `${state.input.title} ${description.status}`;
	const separator = description.activity.isTurnCount ? " " : ": ";
	return `${state.input.title} ${description.status}${separator}${description.activity.text}`;
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
		progress: stoppedProgress(title),
	};
}

function errorResult(title: string, diagnostic: string): RunnerSubagentResult {
	return {
		status: "error",
		title,
		diagnostic,
		error: { message: diagnostic },
		elapsedMs: 0,
		progress: stoppedProgress(title),
	};
}

function stoppedProgress(title: string): RunnerSubagentResult["progress"] {
	return { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 };
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
