import type {
	RunnerSubagentLaunchMetadata,
	RunnerSubagentProgress,
	RunnerSubagentResult,
} from "./extension-api.ts";

export type RunnerSubagentPresentationSource =
	| RunnerSubagentProgress
	| RunnerSubagentResult<unknown>;

export interface RunnerSubagentProgressWidgetOptions {
	fallbackTitle?: string;
	includeElapsed?: boolean;
}

export function formatRunnerSubagentElapsed(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	const totalSeconds = Math.floor(elapsedMs / 1_000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	if (totalMinutes < 60) {
		return `${totalMinutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
	}
	return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

export function runnerSubagentDisplayTitle(
	source: RunnerSubagentPresentationSource,
	fallback = "(untitled forked Pi session)",
): string {
	const title = "progress" in source ? (source.title ?? source.progress.title) : source.title;
	return title ?? fallback;
}

export function runnerSubagentSessionFile(
	source: RunnerSubagentPresentationSource,
): string | undefined {
	return "progress" in source
		? (source.sessionFile ?? source.progress.sessionFile)
		: source.sessionFile;
}

export function runnerSubagentSessionFileText(
	source: RunnerSubagentPresentationSource,
	fallback = "(not available)",
): string {
	return runnerSubagentSessionFile(source) ?? fallback;
}

export function formatRunnerSubagentModelText(launch: RunnerSubagentLaunchMetadata): string {
	if (launch.modelSelection !== undefined) {
		return `${launch.modelSelection.provider}/${launch.modelSelection.modelId}`;
	}
	if (launch.requestedModelSelection !== undefined) {
		return `${launch.requestedModelSelection.provider}/${launch.requestedModelSelection.modelId}`;
	}
	return "default (not specified)";
}

export function formatRunnerSubagentThinkingText(launch: RunnerSubagentLaunchMetadata): string {
	if (launch.observedThinkingLevel !== undefined) return launch.observedThinkingLevel;
	if (launch.hasThinkingArg) return launch.thinkingLevel;
	if (launch.requestedModelSelection !== undefined) return "default (unobserved)";
	return launch.thinkingLevel;
}

export function formatRunnerSubagentProgressWidgetLines(
	progress: RunnerSubagentProgress,
	options: RunnerSubagentProgressWidgetOptions = {},
): string[] {
	const { fallbackTitle = "(untitled forked Pi session)", includeElapsed = true } = options;
	const lines = [
		`Forked Pi: ${runnerSubagentDisplayTitle(progress, fallbackTitle)}`,
		`State: ${progress.state}`,
	];
	if (progress.currentTool !== undefined) lines.push(`Tool: ${progress.currentTool}`);
	lines.push(`Turns/tools: ${progress.turnCount}/${progress.toolCount}`);
	if (includeElapsed) lines.push(`Elapsed: ${formatRunnerSubagentElapsed(progress.elapsedMs)}`);
	const sessionFile = runnerSubagentSessionFile(progress);
	if (sessionFile !== undefined) lines.push(`Session: ${sessionFile}`);
	return lines;
}
