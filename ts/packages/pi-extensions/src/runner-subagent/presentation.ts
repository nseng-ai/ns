import type { RunnerSubagentProgress, RunnerSubagentResult } from "../runner-subagent.ts";

export type RunnerSubagentPresentationSource = RunnerSubagentProgress | RunnerSubagentResult<unknown>;

export interface RunnerSubagentProgressWidgetOptions {
	fallbackTitle?: string;
	includeElapsed?: boolean;
}

export function formatRunnerSubagentElapsed(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

export function runnerSubagentDisplayTitle(source: RunnerSubagentPresentationSource, fallback = "(untitled subagent session)"): string {
	const title = "progress" in source ? source.title ?? source.progress.title : source.title;
	return title ?? fallback;
}

export function runnerSubagentSessionFile(source: RunnerSubagentPresentationSource): string | undefined {
	return "progress" in source ? source.sessionFile ?? source.progress.sessionFile : source.sessionFile;
}

export function runnerSubagentSessionFileText(source: RunnerSubagentPresentationSource, fallback = "(not available)"): string {
	return runnerSubagentSessionFile(source) ?? fallback;
}

export function formatRunnerSubagentProgressWidgetLines(
	progress: RunnerSubagentProgress,
	options: RunnerSubagentProgressWidgetOptions = {},
): string[] {
	const { fallbackTitle = "(untitled subagent session)", includeElapsed = true } = options;
	const lines = [`Subagent: ${runnerSubagentDisplayTitle(progress, fallbackTitle)}`, `State: ${progress.state}`];
	if (progress.currentTool !== undefined) lines.push(`Tool: ${progress.currentTool}`);
	lines.push(`Turns/tools: ${progress.turnCount}/${progress.toolCount}`);
	if (includeElapsed) lines.push(`Elapsed: ${formatRunnerSubagentElapsed(progress.elapsedMs)}`);
	const sessionFile = runnerSubagentSessionFile(progress);
	if (sessionFile !== undefined) lines.push(`Session: ${sessionFile}`);
	return lines;
}
