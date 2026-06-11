import type { ModelInfo, ThinkingLevel } from "./cmux/types.ts";
import { composePiAgentPrompt, loadPiAgentDefinition, type PiAgentDefinition } from "./pi-agent-definition.ts";
import { buildCuratedRunnerSubagentContext, type CuratedRunnerSubagentContextAudit } from "./runner-subagent/curated-context.ts";
import { resolveRunnerSubagentLaunch } from "./runner-subagent/subagent-process.ts";
import {
	dispatchRunnerSubagent,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
	type RunnerSubagentProgress,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
	type RunnerSubagentUsageMetadata,
} from "./runner-subagent.ts";
import { emptyRunnerSubagentActivity } from "./runner-subagent/activity.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentModelText,
	formatRunnerSubagentThinkingText,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
	runnerSubagentSessionFileText,
} from "./runner-subagent/presentation.ts";
import { formatRunnerSubagentActivityWidgetLines } from "./runner-subagent/widget.ts";

export const DISPATCH_RUNNER_SUBAGENT_TOOL_NAME = "dispatch_runner_subagent";
export const MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS = 48_000;

const WIDGET_KEY = DISPATCH_RUNNER_SUBAGENT_TOOL_NAME;

interface TextContent {
	type: "text";
	text: string;
}

export interface ToolResult {
	content: TextContent[];
	details?: unknown;
}

export interface DispatchRunnerSubagentInput {
	title: string;
	prompt: string;
	model?: string;
}

export interface DispatchRunnerSubagentDetails {
	status: RunnerSubagentResult["status"];
	title?: string;
	requestedModel?: string;
	curatedContext?: CuratedRunnerSubagentContextAudit;
	elapsedMs: number;
	sessionFile?: string;
	progress: RunnerSubagentResult["progress"];
	usage?: RunnerSubagentUsageMetadata;
	finalTextChars?: number;
	finalTextTruncated?: boolean;
	diagnostic?: string;
	stopReason?: string;
	error?: unknown;
	protocolError?: unknown;
}

interface DispatchRunnerSubagentSessionManager {
	getBranch?(): readonly unknown[];
	getEntries?(): readonly unknown[];
}

export interface ExtensionContext {
	cwd: string;
	model?: ModelInfo;
	sessionManager?: DispatchRunnerSubagentSessionManager;
	hasUI?: boolean;
	ui?: {
		setStatus?(key: string, text: string | undefined): void;
		setWidget?(key: string, content: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
}

export interface ToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: object;
	execute(
		toolCallId: string,
		params: DispatchRunnerSubagentInput,
		signal: AbortSignal | undefined,
		onUpdate: ((partial: ToolResult) => void) | undefined,
		ctx: ExtensionContext,
	): Promise<ToolResult>;
}

export interface ExtensionAPI extends RunnerSubagentPi {
	getThinkingLevel?: () => ThinkingLevel;
	registerTool(tool: ToolDefinition): void;
}

export interface DispatchRunnerSubagentExtensionOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
}

export const DISPATCH_RUNNER_SUBAGENT_PARAMETERS = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "Concise title for the runner subagent artifact/progress.",
		},
		prompt: {
			type: "string",
			description: "Complete prompt for the subagent, including all necessary context.",
		},
		model: {
			type: "string",
			description: "Optional Pi --model pattern for the child runner subagent. Use only when the delegated task is safe for that model.",
		},
	},
	required: ["title", "prompt"],
	additionalProperties: false,
} as const;

export default function dispatchRunnerSubagentExtension(
	pi: ExtensionAPI,
	options: DispatchRunnerSubagentExtensionOptions = {},
): void {
	const loadAgentDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
	const runnerDefinition = loadAgentDefinition("runner", options.cwd ?? process.cwd());
	if (runnerDefinition.toolName !== DISPATCH_RUNNER_SUBAGENT_TOOL_NAME) {
		throw new Error(
			`Runner agent definition ${runnerDefinition.filePath} declares toolName "${runnerDefinition.toolName}"; expected "${DISPATCH_RUNNER_SUBAGENT_TOOL_NAME}".`,
		);
	}

	pi.registerTool({
		name: DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
		label: runnerDefinition.label,
		description: runnerDefinition.description,
		...(runnerDefinition.promptSnippet === undefined ? {} : { promptSnippet: runnerDefinition.promptSnippet }),
		promptGuidelines: runnerDefinition.promptGuidelines,
		parameters: DISPATCH_RUNNER_SUBAGENT_PARAMETERS,
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const input = validateDispatchRunnerSubagentInput(params);
			const curatedContext = buildCuratedRunnerSubagentContext({
				title: input.title,
				prompt: input.prompt,
				cwd: ctx.cwd,
				sessionEntries: ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [],
			});
			const childPrompt = `${curatedContext.markdown}\n\n${composePiAgentPrompt(runnerDefinition, input)}`;
			const launch =
				resolveRunnerSubagentLaunch(pi, ctx, {
					prompt: childPrompt,
					returnMode: "final-text",
					model: input.model,
				}) ?? defaultRunnerSubagentLaunchMetadata();
			const initialUpdate: RunnerSubagentUpdate = {
				progress: initialDispatchProgress(input.title, launch),
				activity: emptyRunnerSubagentActivity(),
			};
			onUpdate?.({
				content: [{ type: "text", text: `Dispatching runner subagent: ${input.title}` }],
				details: { status: "starting", title: input.title, progress: initialUpdate.progress, curatedContext: curatedContext.audit },
			});
			setWidget(ctx, formatRunnerSubagentActivityWidgetLines(initialUpdate));

			try {
				const result = await dispatchRunnerSubagent(
					pi,
					{ cwd: ctx.cwd, ...(signal === undefined ? {} : { signal }), ...(ctx.model === undefined ? {} : { model: ctx.model }) },
					{
						title: input.title,
						prompt: childPrompt,
						...(input.model === undefined ? {} : { model: input.model }),
						returnMode: "final-text",
						preResolvedLaunch: launch,
						onProgress: (update) => {
							const progressText = formatDispatchRunnerSubagentProgress(update.progress);
							onUpdate?.({
								content: [{ type: "text", text: progressText }],
								details: { status: "running", title: input.title, progress: update.progress },
							});
							setWidget(ctx, formatRunnerSubagentActivityWidgetLines(update));
						},
					},
				);

				return {
					content: [{ type: "text", text: formatDispatchRunnerSubagentResult(result) }],
					details: dispatchRunnerSubagentDetails(result, { requestedModel: input.model, curatedContext: curatedContext.audit }),
				};
			} finally {
				setWidget(ctx, undefined);
			}
		},
	});
}

export function formatDispatchRunnerSubagentResult(result: RunnerSubagentResult): string {
	const sessionFile = runnerSubagentSessionFile(result);
	const lines = [
		"dispatch_runner_subagent result",
		`Status: ${result.status}`,
		`Title: ${runnerSubagentDisplayTitle(result)}`,
		...(result.progress.launch === undefined ? [] : [formatLaunchLine(result.progress.launch)]),
		formatUsageLine(result.usage),
		`Session file: ${runnerSubagentSessionFileText(result)}`,
		formatProgressLine(result),
	];
	const stopReason = readStopReason(result);
	if (stopReason !== undefined) lines.push(`Stop reason: ${stopReason}`);

	if (result.status === "final-text") {
		const finalText = truncateFinalTextForToolContent(result.finalText);
		lines.push("", "Final text:", finalText.text);
		if (finalText.truncated) {
			lines.push(
				"",
				`[Final text truncated to ${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${finalText.originalChars} characters. Full text available in subagent session file: ${sessionFile ?? "(not available)"}.]`,
			);
		}
		return lines.join("\n");
	}

	const diagnostic = resultDiagnostic(result);
	if (diagnostic !== undefined) lines.push(`Diagnostic: ${diagnostic}`);
	lines.push("", "The subagent did not produce usable final text. Inspect the session file before treating this delegated task as complete.");
	return lines.join("\n");
}

export function dispatchRunnerSubagentDetails(
	result: RunnerSubagentResult,
	options: { requestedModel?: string | undefined; curatedContext?: CuratedRunnerSubagentContextAudit | undefined } = {},
): DispatchRunnerSubagentDetails {
	const title = result.title ?? result.progress.title;
	const sessionFile = runnerSubagentSessionFile(result);
	const details: DispatchRunnerSubagentDetails = {
		status: result.status,
		...(title === undefined ? {} : { title }),
		...(options.requestedModel === undefined ? {} : { requestedModel: options.requestedModel }),
		...(options.curatedContext === undefined ? {} : { curatedContext: options.curatedContext }),
		elapsedMs: result.elapsedMs,
		...(sessionFile === undefined ? {} : { sessionFile }),
		progress: result.progress,
		...(result.usage === undefined ? {} : { usage: result.usage }),
	};

	switch (result.status) {
		case "completed":
		case "blocked": {
			const diagnostic = resultDiagnostic(result);
			if (diagnostic !== undefined) details.diagnostic = diagnostic;
			break;
		}
		case "final-text": {
			const finalText = truncateFinalTextForToolContent(result.finalText);
			details.finalTextChars = finalText.originalChars;
			details.finalTextTruncated = finalText.truncated;
			if (result.stopReason !== undefined) details.stopReason = result.stopReason;
			break;
		}
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			details.diagnostic = result.diagnostic;
			if (result.stopReason !== undefined) details.stopReason = result.stopReason;
			break;
		case "cancelled":
			details.diagnostic = result.diagnostic;
			break;
		case "error":
			details.diagnostic = result.diagnostic;
			details.error = result.error;
			break;
		case "protocol-error":
			details.diagnostic = result.diagnostic;
			details.protocolError = result.protocolError;
			break;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}

	return details;
}

export function truncateFinalTextForToolContent(text: string): { text: string; truncated: boolean; originalChars: number } {
	const originalChars = text.length;
	if (originalChars <= MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS) {
		return { text, truncated: false, originalChars };
	}
	return {
		text: text.slice(0, MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS),
		truncated: true,
		originalChars,
	};
}

export function formatElapsed(elapsedMs: number): string {
	return formatRunnerSubagentElapsed(elapsedMs);
}

export function formatDispatchRunnerSubagentProgress(progress: RunnerSubagentProgress): string {
	const currentTool = progress.currentTool === undefined ? "" : `; current tool: ${progress.currentTool}`;
	return [
		`Running runner subagent: ${runnerSubagentDisplayTitle(progress)}`,
		`State: ${progress.state}; turns: ${progress.turnCount}; tools: ${progress.toolCount}${currentTool}; elapsed: ${formatElapsed(progress.elapsedMs)}`,
		...(progress.launch === undefined ? [] : [formatLaunchLine(progress.launch)]),
		`Session file: ${runnerSubagentSessionFileText(progress)}`,
	].join("\n");
}

export function resultDiagnostic(result: RunnerSubagentResult): string | undefined {
	switch (result.status) {
		case "completed":
			return "Subagent Pi completed with a terminal capture instead of final assistant text.";
		case "blocked":
			return "Subagent Pi blocked with a terminal capture instead of final assistant text.";
		case "final-text":
			return undefined;
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
		case "cancelled":
		case "error":
		case "protocol-error":
			return result.diagnostic;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}

function initialDispatchProgress(title: string, launch: RunnerSubagentLaunchMetadata): RunnerSubagentProgress {
	return {
		title,
		state: "starting",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: 0,
		launch,
	};
}

function defaultRunnerSubagentLaunchMetadata(): RunnerSubagentLaunchMetadata {
	return {
		thinkingLevel: "off",
		hasModelArg: false,
		hasThinkingArg: false,
	};
}

function setWidget(ctx: ExtensionContext, lines: string[] | undefined): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui?.setWidget?.(WIDGET_KEY, lines, { placement: "aboveEditor" });
	} catch {
		// UI updates are display-only and must not affect tool execution.
	}
}

function validateDispatchRunnerSubagentInput(params: DispatchRunnerSubagentInput): DispatchRunnerSubagentInput {
	if (typeof params.title !== "string" || params.title.trim().length === 0) {
		throw new Error("dispatch_runner_subagent requires a non-empty title string.");
	}
	if (typeof params.prompt !== "string" || params.prompt.trim().length === 0) {
		throw new Error("dispatch_runner_subagent requires a non-empty prompt string.");
	}
	if (params.model !== undefined && (typeof params.model !== "string" || params.model.trim().length === 0)) {
		throw new Error("dispatch_runner_subagent model must be a non-empty string when provided.");
	}
	const model = params.model?.trim();
	return { title: params.title.trim(), prompt: params.prompt, ...(model === undefined ? {} : { model }) };
}

function formatLaunchLine(launch: RunnerSubagentLaunchMetadata): string {
	return `Model: ${formatRunnerSubagentModelText(launch)}; Thinking: ${formatRunnerSubagentThinkingText(launch)}`;
}

function formatUsageLine(usage: RunnerSubagentUsageMetadata | undefined): string {
	if (usage === undefined) return "Usage: unavailable (not collected)";
	if (usage.status === "unavailable") return `Usage: unavailable (${formatUsageUnavailableReason(usage)})`;
	const totals = usage.totals;
	return [
		`Usage: ${formatCompactUsageTokens(totals.input)} in / ${formatCompactUsageTokens(totals.output)} out`,
		`cache R${formatCompactUsageTokens(totals.cacheRead)} W${formatCompactUsageTokens(totals.cacheWrite)}`,
		`$${totals.cost.total.toFixed(4)}`,
	].join(", ");
}

function formatUsageUnavailableReason(usage: Extract<RunnerSubagentUsageMetadata, { status: "unavailable" }>): string {
	switch (usage.reason) {
		case "missing-session-file":
			return "session file missing";
		case "session-read-error":
			return "session file not readable";
		case "malformed-session-jsonl":
			return "malformed session JSONL";
		case "no-assistant-usage":
			return "no assistant usage";
		default: {
			const exhaustive: never = usage.reason;
			return exhaustive;
		}
	}
}

function formatCompactUsageTokens(count: number): string {
	if (count < 1_000) return Math.round(count).toString();
	if (count < 100_000) return `${trimTrailingZero((count / 1_000).toFixed(1))}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 100_000_000) return `${trimTrailingZero((count / 1_000_000).toFixed(1))}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function trimTrailingZero(text: string): string {
	return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function formatProgressLine(result: RunnerSubagentResult): string {
	const currentTool = result.progress.currentTool === undefined ? "" : `; current tool: ${result.progress.currentTool}`;
	return `Elapsed: ${formatElapsed(result.elapsedMs)}; turns: ${result.progress.turnCount}; tools: ${result.progress.toolCount}${currentTool}`;
}

function readStopReason(result: RunnerSubagentResult): string | undefined {
	switch (result.status) {
		case "completed":
		case "blocked":
		case "cancelled":
		case "error":
		case "protocol-error":
			return undefined;
		case "final-text":
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			return result.stopReason;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}
