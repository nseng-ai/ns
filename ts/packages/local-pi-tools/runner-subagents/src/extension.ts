import { z } from "zod";

import { formatZodError, optionalEntries, optionalEntry } from "@sdl/core/primitives";

import { loadPiAgentDefinition, type PiAgentDefinition } from "@sdl/pi/runtime/agent-definition";
import type { ToolDefinition } from "@sdl/pi/runtime/tool-types";
import {
	resultDiagnostic,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
	type RunnerSubagentProgress,
	type RunnerSubagentResult,
	type RunnerSubagentUsageMetadata,
} from "./extension-api.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentModelText,
	formatRunnerSubagentThinkingText,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
	runnerSubagentSessionFileText,
} from "./presentation.ts";
import type { ExecOptions, ExecResult } from "@sdl/exec";

import type { CuratedRunnerSubagentContextAudit } from "./curated-context.ts";
import { runFinalTextSubagent } from "./dispatch-preparation.ts";
export { resultDiagnostic } from "./extension-api.ts";
export type { ToolContext, ToolDefinition, ToolResult } from "@sdl/pi/runtime/tool-types";

export const DISPATCH_RUNNER_SUBAGENT_TOOL_NAME = "dispatch_runner_subagent";
export const MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS = 48_000;

const WIDGET_KEY = DISPATCH_RUNNER_SUBAGENT_TOOL_NAME;

const dispatchRunnerSubagentInputSchema = z.object({
	title: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	model: z.string().trim().min(1).optional(),
});

export type DispatchRunnerSubagentInput = z.infer<typeof dispatchRunnerSubagentInputSchema>;

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

export type DispatchRunnerSubagentToolDefinition = ToolDefinition;

export type DispatchRunnerSubagentExtensionAPI = RunnerSubagentPi & {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	getThinkingLevel?: () => RunnerSubagentLaunchMetadata["thinkingLevel"];
	registerTool(definition: ToolDefinition): void;
};

export interface DispatchRunnerSubagentExtensionOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
}

export const DISPATCH_RUNNER_SUBAGENT_PARAMETERS = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "Concise title for the forked Pi process artifact/progress.",
		},
		prompt: {
			type: "string",
			description:
				"Complete prompt for the forked Pi process. An auto-curated context packet (git status/diff summary and excerpts of backtick-mentioned files) is appended automatically; do not paste large file contents the forked process can read itself.",
		},
		model: {
			type: "string",
			description:
				"Optional Pi --model pattern for the forked Pi process. Unqualified patterns inherit the current session provider, and provider-specific shorthands that do not match that provider are rejected. Use fully qualified provider/model strings when switching providers.",
		},
	},
	required: ["title", "prompt"],
	additionalProperties: false,
} as const;

export default function dispatchRunnerSubagentExtension(
	pi: DispatchRunnerSubagentExtensionAPI,
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
		...(runnerDefinition.promptSnippet === undefined
			? {}
			: { promptSnippet: runnerDefinition.promptSnippet }),
		promptGuidelines: runnerDefinition.promptGuidelines,
		parameters: DISPATCH_RUNNER_SUBAGENT_PARAMETERS,
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const input = validateDispatchRunnerSubagentInput(params);
			const { result, curatedContext } = await runFinalTextSubagent({
				pi,
				ctx,
				definition: runnerDefinition,
				title: input.title,
				prompt: input.prompt,
				widgetKey: WIDGET_KEY,
				...optionalEntries({ model: input.model, signal }),
				onStart: (start) => {
					onUpdate?.({
						content: [{ type: "text", text: `Dispatching forked Pi process: ${input.title}` }],
						details: {
							status: "starting",
							title: input.title,
							progress: start.update.progress,
							curatedContext: start.curatedContext.audit,
						},
					});
				},
				onProgress: (update) => {
					const progressText = formatDispatchRunnerSubagentProgress(update.progress);
					onUpdate?.({
						content: [{ type: "text", text: progressText }],
						details: {
							status: "running",
							title: input.title,
							progress: update.progress,
						},
					});
				},
			});

			return {
				content: [{ type: "text", text: formatDispatchRunnerSubagentResult(result) }],
				details: dispatchRunnerSubagentDetails(result, {
					...optionalEntry("requestedModel", input.model),
					curatedContext: curatedContext.audit,
				}),
			};
		},
	});
}

export function formatDispatchRunnerSubagentResult(result: RunnerSubagentResult): string {
	const sessionFile = runnerSubagentSessionFile(result);
	const lines = [
		"dispatch_runner_subagent result (forked Pi process)",
		`Status: ${result.status}`,
		`Title: ${runnerSubagentDisplayTitle(result)}`,
		...(result.progress.launch === undefined ? [] : [formatLaunchLine(result.progress.launch)]),
		formatUsageLine(result.usage),
		`Session file: ${runnerSubagentSessionFileText(result)}`,
		formatProgressLine(result),
	];
	const stopReason = runnerSubagentStopReason(result);
	if (stopReason !== undefined) lines.push(`Stop reason: ${stopReason}`);

	if (result.status === "final-text") {
		const finalText = truncateFinalTextForToolContent(result.finalText);
		lines.push("", "Final text:", finalText.text);
		if (finalText.truncated) {
			lines.push(
				"",
				`[Final text truncated to ${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${finalText.originalChars} characters. Full text available in forked Pi session file: ${sessionFile ?? "(not available)"}.]`,
			);
		}
		return lines.join("\n");
	}

	const diagnostic = resultDiagnostic(result);
	if (diagnostic !== undefined) lines.push(`Diagnostic: ${diagnostic}`);
	lines.push(
		"",
		"The forked Pi process did not produce usable final text. Inspect the session file before treating this delegated task as complete.",
	);
	return lines.join("\n");
}

export function dispatchRunnerSubagentDetails(
	result: RunnerSubagentResult,
	options: {
		requestedModel?: string;
		curatedContext?: CuratedRunnerSubagentContextAudit;
	} = {},
): DispatchRunnerSubagentDetails {
	const title = result.title ?? result.progress.title;
	const sessionFile = runnerSubagentSessionFile(result);
	const stopReason = runnerSubagentStopReason(result);
	const details: DispatchRunnerSubagentDetails = {
		status: result.status,
		...(title === undefined ? {} : { title }),
		...optionalEntries({
			requestedModel: options.requestedModel,
			curatedContext: options.curatedContext,
		}),
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
			if (stopReason !== undefined) details.stopReason = stopReason;
			break;
		}
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			details.diagnostic = result.diagnostic;
			if (stopReason !== undefined) details.stopReason = stopReason;
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

export function truncateFinalTextForToolContent(text: string): {
	text: string;
	truncated: boolean;
	originalChars: number;
} {
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
	const currentTool =
		progress.currentTool === undefined ? "" : `; current tool: ${progress.currentTool}`;
	return [
		`Running forked Pi process: ${runnerSubagentDisplayTitle(progress)}`,
		`State: ${progress.state}; turns: ${progress.turnCount}; tools: ${progress.toolCount}${currentTool}; elapsed: ${formatElapsed(progress.elapsedMs)}`,
		...(progress.launch === undefined ? [] : [formatLaunchLine(progress.launch)]),
		`Session file: ${runnerSubagentSessionFileText(progress)}`,
	].join("\n");
}

function validateDispatchRunnerSubagentInput(params: unknown): DispatchRunnerSubagentInput {
	const parsed = dispatchRunnerSubagentInputSchema.safeParse(params);
	if (!parsed.success) throw new Error(formatZodError(parsed.error));
	return parsed.data;
}

function formatLaunchLine(launch: RunnerSubagentLaunchMetadata): string {
	return `Model: ${formatRunnerSubagentModelText(launch)}; Thinking: ${formatRunnerSubagentThinkingText(launch)}`;
}

function formatUsageLine(usage: RunnerSubagentUsageMetadata | undefined): string {
	if (usage === undefined) return "Usage: unavailable (not collected)";
	if (usage.status === "unavailable")
		return `Usage: unavailable (${formatUsageUnavailableReason(usage)})`;
	const totals = usage.totals;
	return [
		`Usage: ${formatCompactUsageTokens(totals.input)} in / ${formatCompactUsageTokens(totals.output)} out`,
		`cache R${formatCompactUsageTokens(totals.cacheRead)} W${formatCompactUsageTokens(totals.cacheWrite)}`,
		`$${totals.cost.total.toFixed(4)}`,
	].join(", ");
}

function formatUsageUnavailableReason(
	usage: Extract<RunnerSubagentUsageMetadata, { status: "unavailable" }>,
): string {
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
	const currentTool =
		result.progress.currentTool === undefined
			? ""
			: `; current tool: ${result.progress.currentTool}`;
	return `Elapsed: ${formatElapsed(result.elapsedMs)}; turns: ${result.progress.turnCount}; tools: ${result.progress.toolCount}${currentTool}`;
}

function runnerSubagentStopReason(result: RunnerSubagentResult): string | undefined {
	return "stopReason" in result ? result.stopReason : undefined;
}
