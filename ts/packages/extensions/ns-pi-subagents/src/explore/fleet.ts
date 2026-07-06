import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import {
	compareFleetTasksForDisplay,
	setRunnerSubagentWidget,
	type RunnerSubagentFleetRunSnapshot,
	type RunnerSubagentFleetTaskSnapshot,
} from "@internal/pi-tools/runner-subagents";

export const EXPLORE_FLEET_WIDGET_KEY = "ns.explore.fleet";

export function syncExploreFleetWidget(
	ctx: ToolContext,
	runs: readonly RunnerSubagentFleetRunSnapshot[],
): void {
	const lines = formatExploreFleetWidgetLines(runs);
	setRunnerSubagentWidget(ctx, EXPLORE_FLEET_WIDGET_KEY, lines.length === 0 ? undefined : lines);
}

export function formatExploreFleetWidgetLines(
	runs: readonly RunnerSubagentFleetRunSnapshot[],
): string[] {
	const tasks = sortedFleetTasks(runs);
	if (tasks.length === 0) return [];
	const running = tasks.filter((task) => task.state === "running").length;
	return [
		`explore fleet: ${running} running, ${tasks.length - running} recent`,
		...tasks.map(formatExploreFleetTaskLine),
	];
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
