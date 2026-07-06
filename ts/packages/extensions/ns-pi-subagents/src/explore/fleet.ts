import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import {
	compareFleetTasksForDisplay,
	setRunnerSubagentWidget,
	type RunnerSubagentFleetRunSnapshot,
	type RunnerSubagentFleetTaskSnapshot,
} from "@internal/pi-tools/runner-subagents";
import { EXPLORE_FLEET_COMMAND_NAME } from "./contract.ts";

export const EXPLORE_FLEET_WIDGET_KEY = "ns.explore.fleet";
export const EXPLORE_FLEET_STATUS_KEY = "ns.explore.fleet";
export const EXPLORE_FLEET_ENTRY_HINT = `/${EXPLORE_FLEET_COMMAND_NAME} to inspect`;

export function syncExploreFleetDisplay(
	ctx: ToolContext,
	runs: readonly RunnerSubagentFleetRunSnapshot[],
): void {
	const lines = formatExploreFleetWidgetLines(runs);
	setRunnerSubagentWidget(ctx, EXPLORE_FLEET_WIDGET_KEY, lines.length === 0 ? undefined : lines);
	setExploreFleetStatus(ctx, formatExploreFleetStatusText(runs));
}

export function formatExploreFleetWidgetLines(
	runs: readonly RunnerSubagentFleetRunSnapshot[],
): string[] {
	const tasks = sortedFleetTasks(runs);
	if (tasks.length === 0) return [];
	const running = tasks.filter((task) => task.state === "running").length;
	return [
		`explore fleet: ${running} running, ${tasks.length - running} recent · ${EXPLORE_FLEET_ENTRY_HINT}`,
		...tasks.map(formatExploreFleetTaskLine),
	];
}

export function formatExploreFleetStatusText(
	runs: readonly RunnerSubagentFleetRunSnapshot[],
): string | undefined {
	const tasks = sortedFleetTasks(runs);
	if (tasks.length === 0) return undefined;
	return `explore fleet: ${describeFleetCounts(tasks)} · /${EXPLORE_FLEET_COMMAND_NAME}`;
}

function describeFleetCounts(tasks: readonly RunnerSubagentFleetTaskSnapshot[]): string {
	const running = tasks.filter((task) => task.state === "running").length;
	const queued = tasks.filter((task) => task.state === "queued").length;
	if (running + queued > 0) {
		return queued > 0 ? `${running} running, ${queued} queued` : `${running} running`;
	}
	const failed = tasks.filter((task) => task.finalStatus !== "final-text").length;
	const succeeded = tasks.length - failed;
	return failed > 0 ? `${succeeded} done, ${failed} failed` : `${succeeded} done`;
}

function setExploreFleetStatus(ctx: ToolContext, text: string | undefined): void {
	if (!ctx.hasUI) return;
	try {
		ctx.ui.setStatus?.(EXPLORE_FLEET_STATUS_KEY, text);
	} catch {
		// Status updates are display-only and must not affect subagent execution.
	}
}

function formatExploreFleetTaskLine(task: RunnerSubagentFleetTaskSnapshot): string {
	const icon = taskIcon(task);
	const status = task.finalStatus ?? task.state;
	const suffix = task.sessionFile ?? task.latestActivity;
	return truncatePlain(
		`${icon} ${task.title} — ${status}${suffix === undefined ? "" : ` — ${suffix}`}`,
		180,
	);
}

export function sortedFleetTasks(
	runs: readonly { tasks: readonly RunnerSubagentFleetTaskSnapshot[] }[],
): RunnerSubagentFleetTaskSnapshot[] {
	return runs.flatMap((run) => run.tasks).sort(compareFleetTasksForDisplay);
}

export function taskIcon(task: RunnerSubagentFleetTaskSnapshot): string {
	if (task.state === "queued") return "·";
	if (task.state === "running") return "▶";
	return task.finalStatus === "final-text" ? "✓" : "✗";
}
