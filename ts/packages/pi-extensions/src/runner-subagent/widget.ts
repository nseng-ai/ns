import type { RunnerSubagentUpdate } from "../runner-subagent.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentModelText,
	formatRunnerSubagentThinkingText,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
} from "./presentation.ts";

export interface RunnerSubagentWidgetOptions {
	fallbackTitle?: string;
	includeElapsed?: boolean;
}

type SetWidgetFunction = (
	key: string,
	content: string[] | undefined,
	options?: { placement?: "aboveEditor" | "belowEditor" },
) => void;

export interface RunnerSubagentWidgetContext {
	hasUI?: boolean;
	ui?: object;
}

export function setRunnerSubagentWidget(
	ctx: RunnerSubagentWidgetContext,
	key: string,
	lines: string[] | undefined,
): void {
	if (ctx.hasUI === false) return;
	const setWidget = readSetWidget(ctx.ui);
	if (setWidget === undefined) return;
	try {
		setWidget(key, lines, { placement: "aboveEditor" });
	} catch {
		// Widget updates are display-only and must not affect subagent execution.
	}
}

function readSetWidget(ui: object | undefined): SetWidgetFunction | undefined {
	if (ui === undefined) return undefined;
	const candidate = (ui as { setWidget?: unknown }).setWidget;
	return isSetWidgetFunction(candidate) ? candidate : undefined;
}

function isSetWidgetFunction(value: unknown): value is SetWidgetFunction {
	return typeof value === "function";
}

export function formatRunnerSubagentActivityWidgetLines(
	update: RunnerSubagentUpdate,
	options: RunnerSubagentWidgetOptions = {},
): string[] {
	const { fallbackTitle = "(untitled subagent session)", includeElapsed = true } = options;
	const { progress, activity } = update;
	const lines = [
		`Subagent: ${runnerSubagentDisplayTitle(progress, fallbackTitle)}`,
		`State: ${progress.state}`,
	];
	if (progress.launch !== undefined) {
		lines.push(
			`Model: ${formatRunnerSubagentModelText(progress.launch)}`,
			`Thinking: ${formatRunnerSubagentThinkingText(progress.launch)}`,
		);
	}

	if (activity.assistantPreview !== undefined)
		lines.push(`Assistant: ${activity.assistantPreview}`);
	if (progress.currentTool !== undefined) lines.push(`Tool: ${progress.currentTool}`);
	if (activity.currentToolInputPreview !== undefined)
		lines.push(`Input: ${activity.currentToolInputPreview}`);
	if (activity.lastToolResultPreview !== undefined) {
		const label = activity.lastToolResultIsError === true ? "Last error" : "Last result";
		const toolSuffix = activity.lastToolName === undefined ? "" : ` (${activity.lastToolName})`;
		lines.push(`${label}${toolSuffix}: ${activity.lastToolResultPreview}`);
	}
	lines.push(`Turns/tools: ${progress.turnCount}/${progress.toolCount}`);
	if (includeElapsed) lines.push(`Elapsed: ${formatRunnerSubagentElapsed(progress.elapsedMs)}`);
	const sessionFile = runnerSubagentSessionFile(progress);
	if (sessionFile !== undefined) lines.push(`Session: ${sessionFile}`);
	return lines;
}
