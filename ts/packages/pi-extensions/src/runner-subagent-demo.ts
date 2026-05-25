import { customMessageText, truncateDisplayLine } from "./terminal-presentation.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentProgressWidgetLines,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
	runnerSubagentSessionFileText,
} from "./runner-subagent/presentation.ts";

import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentProgress,
	type RunnerSubagentResult,
	type RunnerSubagentStatus,
	type RunnerSubagentTerminalToolDefinition,
} from "./runner-subagent.ts";

export const RUNNER_SUBAGENT_DEMO_COMMAND_NAME = "runner-subagent-demo";
export const RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE = "runner-subagent-demo-result";

const WIDGET_KEY = RUNNER_SUBAGENT_DEMO_COMMAND_NAME;

const COMPLETE_TOOL_NAME = "runner_subagent_demo_complete";
const BLOCKED_TOOL_NAME = "runner_subagent_demo_blocked";

const USAGE = `Usage: /runner-subagent-demo <task>

Launches a fresh runner subagent for <task>. The subagent must finish by calling exactly one terminal capture tool, then the parent displays the structured result and subagent session file.`;

export type NotifyLevel = "info" | "success" | "warning" | "error";

export type CustomMessageContent = string | Array<{ type: string; text?: string }>;

export type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

export type RenderTheme = {
	fg(color: string, text: string): string;
};

export type RenderComponent = {
	render(width: number): string[];
	invalidate(): void;
};

export type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export type ExtensionCommandContext = {
	cwd: string;
	hasUI: boolean;
	signal?: AbortSignal;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	sendUserMessage?(content: string): void;
};

export type RunnerSubagentDemoCompleteInput = {
	summary: string;
	evidence?: string[];
};

export type RunnerSubagentDemoBlockedInput = {
	reason: string;
	needs?: string[];
};

export type RunnerSubagentDemoTerminalInput = RunnerSubagentDemoCompleteInput | RunnerSubagentDemoBlockedInput;

const TERMINAL_TOOLS = [
	{
		name: COMPLETE_TOOL_NAME,
		status: "completed",
		description: "Finish the runner-subagent demo with a concise summary and optional evidence items.",
		parameters: {
			type: "object",
			properties: {
				summary: { type: "string" },
				evidence: { type: "array", items: { type: "string" } },
			},
			required: ["summary"],
			additionalProperties: false,
		},
	},
	{
		name: BLOCKED_TOOL_NAME,
		status: "blocked",
		description: "Stop the runner-subagent demo as blocked, with the blocker and optional needed inputs.",
		parameters: {
			type: "object",
			properties: {
				reason: { type: "string" },
				needs: { type: "array", items: { type: "string" } },
			},
			required: ["reason"],
			additionalProperties: false,
		},
	},
] as const satisfies readonly RunnerSubagentTerminalToolDefinition[];

export default function runnerSubagentDemoExtension(pi: ExtensionAPI & RunnerSubagentPi): void {
	pi.registerMessageRenderer?.(RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE, renderRunnerSubagentDemoResult);

	pi.registerCommand(RUNNER_SUBAGENT_DEMO_COMMAND_NAME, {
		description: "Run a small task in an awaited runner subagent Pi and display the structured terminal result",
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			const task = rawArgs.trim();
			if (!task || task === "--help" || task === "-h") {
				present(ctx, USAGE, "info");
				return;
			}

			await ctx.waitForIdle();

			const title = subagentTitle(task);
			setWidget(ctx, widgetLines({ title, state: "starting", toolCount: 0, turnCount: 0, elapsedMs: 0 }));

			try {
				const result = await dispatchRunnerSubagent<RunnerSubagentDemoTerminalInput>(pi, subagentContext(ctx), {
					title,
					prompt: buildRunnerSubagentDemoPrompt(task),
					cwd: ctx.cwd,
					...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
					terminalTools: TERMINAL_TOOLS,
				});
				setWidget(ctx, widgetLines(result.progress));
				presentResult(pi, ctx, result);
			} finally {
				setWidget(ctx, undefined);
			}
		},
	});
}

export function buildRunnerSubagentDemoPrompt(task: string): string {
	return [
		"You are a fresh runner subagent launched by the local runner-subagent demo extension.",
		"Complete the delegated task using the current repository working directory as context.",
		`Delegated task:\n${task}`,
		[
			"Completion protocol:",
			`- You must finish by calling exactly one terminal tool: ${COMPLETE_TOOL_NAME} or ${BLOCKED_TOOL_NAME}.`,
			`- Call ${COMPLETE_TOOL_NAME} with { summary: string, evidence?: string[] } when the task is complete.`,
			`- Call ${BLOCKED_TOOL_NAME} with { reason: string, needs?: string[] } when you cannot complete the task.`,
			"- Do not call both terminal tools.",
			"- Do not call a terminal tool in the same assistant turn as any sibling tool call.",
			"- Do not use slash-command text as a completion handoff; the terminal tool payload is the result.",
		].join("\n"),
	].join("\n\n");
}

export function formatDispatchRunnerSubagentResult(result: RunnerSubagentResult<RunnerSubagentDemoTerminalInput>): string {
	const lines = [resultHeadline(result), `Title: ${runnerSubagentDisplayTitle(result, "(untitled subagent)")}`];
	lines.push(formatProgressLine(result.progress));
	lines.push(`Session file: ${runnerSubagentSessionFileText(result)}`);

	if (result.status === "completed") {
		const evidence = stringList(readRecord(result.terminal.input).evidence);
		if (evidence.length > 0) lines.push("Evidence:", ...evidence.map((item) => `- ${item}`));
	} else if (result.status === "blocked") {
		const needs = stringList(readRecord(result.terminal.input).needs);
		if (needs.length > 0) lines.push("Needs:", ...needs.map((item) => `- ${item}`));
	} else if (result.status === "final-text") {
		lines.push("Final text:", result.finalText);
	} else {
		lines.push(`Diagnostic: ${result.diagnostic}`);
	}

	return lines.join("\n");
}

export function renderRunnerSubagentDemoResult(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const text = customMessageText(message.content);
	return {
		render(width: number): string[] {
			return text.split("\n").map((line) => theme.fg(resultLineColor(line), truncateDisplayLine(line, width)));
		},
		invalidate(): void {},
	};
}

function subagentContext(ctx: ExtensionCommandContext): RunnerSubagentContext {
	return {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
	};
}

function presentResult(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	result: RunnerSubagentResult<RunnerSubagentDemoTerminalInput>,
): void {
	const content = formatDispatchRunnerSubagentResult(result);
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE,
			content,
			display: true,
			details: runnerSubagentDemoDetails(result),
		});
		return;
	}
	present(ctx, content, resultLevel(result.status));
}

function present(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, level);
}

function setWidget(ctx: ExtensionCommandContext, lines: string[] | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setWidget?.(WIDGET_KEY, lines, { placement: "aboveEditor" });
}

function widgetLines(progress: RunnerSubagentProgress): string[] {
	return formatRunnerSubagentProgressWidgetLines(progress, { fallbackTitle: "(untitled)", includeElapsed: false });
}

function resultHeadline(result: RunnerSubagentResult<RunnerSubagentDemoTerminalInput>): string {
	if (result.status === "completed") {
		return `✓ Runner subagent completed: ${stringValue(readRecord(result.terminal.input).summary, "completed")}`;
	}
	if (result.status === "blocked") {
		return `⚠ Runner subagent blocked: ${stringValue(readRecord(result.terminal.input).reason, "blocked")}`;
	}
	if (result.status === "final-text") {
		return `✓ Runner subagent final text: ${firstNonEmptyLine(result.finalText) ?? "captured"}`;
	}
	return `✗ Runner subagent ${result.status}: ${result.diagnostic}`;
}

function formatProgressLine(progress: RunnerSubagentProgress): string {
	const currentTool = progress.currentTool ? `, current tool: ${progress.currentTool}` : "";
	return `State: ${progress.state}; turns: ${progress.turnCount}; tools: ${progress.toolCount}; elapsed: ${formatRunnerSubagentElapsed(progress.elapsedMs)}${currentTool}`;
}

function runnerSubagentDemoDetails(result: RunnerSubagentResult<RunnerSubagentDemoTerminalInput>): Record<string, unknown> {
	return {
		status: result.status,
		title: result.title ?? result.progress.title,
		sessionFile: runnerSubagentSessionFile(result),
		progress: result.progress,
	};
}

function resultLevel(status: RunnerSubagentStatus): NotifyLevel {
	if (status === "completed" || status === "final-text") return "success";
	if (status === "blocked") return "warning";
	return "error";
}

function subagentTitle(task: string): string {
	const singleLine = task.replace(/\s+/g, " ").trim();
	const shortTask = singleLine.length > 60 ? `${singleLine.slice(0, 59)}…` : singleLine;
	return `Runner subagent demo: ${shortTask}`;
}

function readRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function firstNonEmptyLine(value: string): string | undefined {
	return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function resultLineColor(line: string): string {
	if (line.startsWith("✓")) return "success";
	if (line.startsWith("⚠")) return "warning";
	if (line.startsWith("✗")) return "error";
	if (line.startsWith("Session file:")) return "accent";
	return "dim";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
