import {
	runChildSession,
	type ChildSessionContext,
	type ChildSessionPi,
	type ChildSessionProgress,
	type ChildSessionResult,
	type ChildSessionStatus,
	type ChildSessionTerminalToolDefinition,
} from "./run-child-session.ts";

export const CHILD_SESSION_DEMO_COMMAND_NAME = "child-session-demo";
export const CHILD_SESSION_DEMO_MESSAGE_TYPE = "child-session-demo-result";

const STATUS_KEY = CHILD_SESSION_DEMO_COMMAND_NAME;
const WIDGET_KEY = CHILD_SESSION_DEMO_COMMAND_NAME;

const COMPLETE_TOOL_NAME = "child_session_demo_complete";
const BLOCKED_TOOL_NAME = "child_session_demo_blocked";

const USAGE = `Usage: /child-session-demo <task>

Launches a fresh child Pi session for <task>. The child must finish by calling exactly one terminal capture tool, then the parent displays the structured result and child session file.`;

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

export type ChildSessionDemoCompleteInput = {
	summary: string;
	evidence?: string[];
};

export type ChildSessionDemoBlockedInput = {
	reason: string;
	needs?: string[];
};

export type ChildSessionDemoTerminalInput = ChildSessionDemoCompleteInput | ChildSessionDemoBlockedInput;

const TERMINAL_TOOLS = [
	{
		name: COMPLETE_TOOL_NAME,
		status: "completed",
		description: "Finish the child-session demo with a concise summary and optional evidence items.",
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
		description: "Stop the child-session demo as blocked, with the blocker and optional needed inputs.",
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
] as const satisfies readonly ChildSessionTerminalToolDefinition[];

export default function childSessionDemoExtension(pi: ExtensionAPI & ChildSessionPi): void {
	pi.registerMessageRenderer?.(CHILD_SESSION_DEMO_MESSAGE_TYPE, renderChildSessionDemoResult);

	pi.registerCommand(CHILD_SESSION_DEMO_COMMAND_NAME, {
		description: "Run a small task in an awaited child Pi session and display the structured terminal result",
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			const task = rawArgs.trim();
			if (!task || task === "--help" || task === "-h") {
				present(ctx, USAGE, "info");
				return;
			}

			await ctx.waitForIdle();

			const title = childTitle(task);
			setStatus(ctx, "launching child session...");
			setWidget(ctx, widgetLines({ title, state: "starting", toolCount: 0, turnCount: 0, elapsedMs: 0 }));

			try {
				setStatus(ctx, "running child session...");
				const result = await runChildSession<ChildSessionDemoTerminalInput>(pi, childContext(ctx), {
					title,
					prompt: buildChildSessionDemoPrompt(task),
					cwd: ctx.cwd,
					...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
					terminalTools: TERMINAL_TOOLS,
				});
				setWidget(ctx, widgetLines(result.progress));
				presentResult(pi, ctx, result);
			} finally {
				setStatus(ctx, undefined);
				setWidget(ctx, undefined);
			}
		},
	});
}

export function buildChildSessionDemoPrompt(task: string): string {
	return [
		"You are a fresh child Pi session launched by the local child-session demo extension.",
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

export function formatChildSessionDemoResult(result: ChildSessionResult<ChildSessionDemoTerminalInput>): string {
	const lines = [resultHeadline(result), `Title: ${result.title ?? result.progress.title ?? "(untitled child session)"}`];
	lines.push(formatProgressLine(result.progress));
	lines.push(`Session file: ${result.sessionFile ?? result.progress.sessionFile ?? "(not available)"}`);

	if (result.status === "completed") {
		const evidence = stringList(readRecord(result.terminal.input).evidence);
		if (evidence.length > 0) lines.push("Evidence:", ...evidence.map((item) => `- ${item}`));
	} else if (result.status === "blocked") {
		const needs = stringList(readRecord(result.terminal.input).needs);
		if (needs.length > 0) lines.push("Needs:", ...needs.map((item) => `- ${item}`));
	} else {
		lines.push(`Diagnostic: ${result.diagnostic}`);
	}

	return lines.join("\n");
}

export function renderChildSessionDemoResult(
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

function childContext(ctx: ExtensionCommandContext): ChildSessionContext {
	return {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
	};
}

function presentResult(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	result: ChildSessionResult<ChildSessionDemoTerminalInput>,
): void {
	const content = formatChildSessionDemoResult(result);
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: CHILD_SESSION_DEMO_MESSAGE_TYPE,
			content,
			display: true,
			details: childSessionDemoDetails(result),
		});
		return;
	}
	present(ctx, content, resultLevel(result.status));
}

function present(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, level);
}

function setStatus(ctx: ExtensionCommandContext, message: string | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus?.(STATUS_KEY, message ? `child-session-demo: ${message}` : undefined);
}

function setWidget(ctx: ExtensionCommandContext, lines: string[] | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setWidget?.(WIDGET_KEY, lines, { placement: "belowEditor" });
}

function widgetLines(progress: ChildSessionProgress): string[] {
	const lines = [`Child: ${progress.title ?? "(untitled)"}`, `State: ${progress.state}`];
	if (progress.currentTool) lines.push(`Tool: ${progress.currentTool}`);
	lines.push(`Turns/tools: ${progress.turnCount}/${progress.toolCount}`);
	if (progress.sessionFile) lines.push(`Session: ${progress.sessionFile}`);
	return lines;
}

function resultHeadline(result: ChildSessionResult<ChildSessionDemoTerminalInput>): string {
	if (result.status === "completed") {
		return `✓ Child session completed: ${stringValue(readRecord(result.terminal.input).summary, "completed")}`;
	}
	if (result.status === "blocked") {
		return `⚠ Child session blocked: ${stringValue(readRecord(result.terminal.input).reason, "blocked")}`;
	}
	return `✗ Child session ${result.status}: ${result.diagnostic}`;
}

function formatProgressLine(progress: ChildSessionProgress): string {
	const currentTool = progress.currentTool ? `, current tool: ${progress.currentTool}` : "";
	return `State: ${progress.state}; turns: ${progress.turnCount}; tools: ${progress.toolCount}; elapsed: ${formatElapsed(progress.elapsedMs)}${currentTool}`;
}

function childSessionDemoDetails(result: ChildSessionResult<ChildSessionDemoTerminalInput>): Record<string, unknown> {
	return {
		status: result.status,
		title: result.title ?? result.progress.title,
		sessionFile: result.sessionFile ?? result.progress.sessionFile,
		progress: result.progress,
	};
}

function resultLevel(status: ChildSessionStatus): NotifyLevel {
	if (status === "completed") return "success";
	if (status === "blocked") return "warning";
	return "error";
}

function childTitle(task: string): string {
	const singleLine = task.replace(/\s+/g, " ").trim();
	const shortTask = singleLine.length > 60 ? `${singleLine.slice(0, 59)}…` : singleLine;
	return `Child demo: ${shortTask}`;
}

function readRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function customMessageText(content: CustomMessageContent): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

function resultLineColor(line: string): string {
	if (line.startsWith("✓")) return "success";
	if (line.startsWith("⚠")) return "warning";
	if (line.startsWith("✗")) return "error";
	if (line.startsWith("Session file:")) return "accent";
	return "dim";
}

function truncateDisplayLine(line: string, width: number): string {
	if (width <= 0) return "";
	if (line.length <= width) return line;
	if (width === 1) return "…";
	return `${line.slice(0, width - 1)}…`;
}

function formatElapsed(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
