import type {
	RunnerSubagentLaunchMetadata,
	RunnerSubagentProgressCallback,
	RunnerSubagentUpdate,
} from "../runner-subagent.ts";
import { emptyRunnerSubagentActivity } from "./activity.ts";
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
	ui?: { setWidget?: SetWidgetFunction };
}

export function setRunnerSubagentWidget(
	ctx: RunnerSubagentWidgetContext,
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

export function buildInitialRunnerSubagentUpdate(input: {
	title: string;
	launch: RunnerSubagentLaunchMetadata;
}): RunnerSubagentUpdate {
	return {
		progress: {
			title: input.title,
			state: "starting",
			toolCount: 0,
			turnCount: 0,
			elapsedMs: 0,
			launch: input.launch,
		},
		activity: emptyRunnerSubagentActivity(),
	};
}

export async function withRunnerSubagentWidget<T>(
	ctx: RunnerSubagentWidgetContext,
	key: string,
	input: { title: string; launch: RunnerSubagentLaunchMetadata },
	run: (onProgress: RunnerSubagentProgressCallback) => Promise<T>,
): Promise<T> {
	const initialUpdate = buildInitialRunnerSubagentUpdate(input);
	setRunnerSubagentWidget(ctx, key, formatRunnerSubagentActivityWidgetLines(initialUpdate));

	try {
		return await run((update) => {
			setRunnerSubagentWidget(ctx, key, formatRunnerSubagentActivityWidgetLines(update));
		});
	} finally {
		setRunnerSubagentWidget(ctx, key, undefined);
	}
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
