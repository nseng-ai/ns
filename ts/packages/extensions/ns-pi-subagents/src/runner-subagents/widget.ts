import type { WidgetRuntimeContext } from "@nseng-ai/pi/runtime/tool-types";

import type { RunnerSubagentUpdate } from "./extension-api.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentModelText,
	formatRunnerSubagentThinkingText,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
} from "./presentation.ts";

export type { WidgetRuntimeContext } from "@nseng-ai/pi/runtime/tool-types";

export interface RunnerSubagentWidgetOptions {
	fallbackTitle?: string;
	includeElapsed?: boolean;
}

export function setRunnerSubagentWidget(
	ctx: WidgetRuntimeContext,
	key: string,
	lines: string[] | undefined,
): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui?.setWidget?.(key, lines, { placement: "aboveEditor" });
	} catch {
		// Widget updates are display-only and must not affect subagent execution.
	}
}

export function formatRunnerSubagentActivityWidgetLines(
	update: RunnerSubagentUpdate,
	options: RunnerSubagentWidgetOptions = {},
): string[] {
	const { fallbackTitle = "(untitled forked Pi session)", includeElapsed = true } = options;
	const { progress, activity } = update;
	const lines = [
		`Forked Pi: ${runnerSubagentDisplayTitle(progress, fallbackTitle)}`,
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
