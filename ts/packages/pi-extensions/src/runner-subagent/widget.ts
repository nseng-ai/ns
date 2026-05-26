import type { RunnerSubagentUpdate } from "../runner-subagent.ts";
import {
	formatRunnerSubagentElapsed,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
} from "./presentation.ts";

export type RunnerSubagentWidgetOptions = {
	fallbackTitle?: string;
	includeElapsed?: boolean;
};

export function formatRunnerSubagentActivityWidgetLines(
	update: RunnerSubagentUpdate,
	options: RunnerSubagentWidgetOptions = {},
): string[] {
	const { fallbackTitle = "(untitled subagent session)", includeElapsed = true } = options;
	const { progress, activity } = update;
	const lines = [`Subagent: ${runnerSubagentDisplayTitle(progress, fallbackTitle)}`, `State: ${progress.state}`];

	if (activity.assistantPreview !== undefined) lines.push(`Assistant: ${activity.assistantPreview}`);
	if (progress.currentTool !== undefined) lines.push(`Tool: ${progress.currentTool}`);
	if (activity.currentToolInputPreview !== undefined) lines.push(`Input: ${activity.currentToolInputPreview}`);
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
