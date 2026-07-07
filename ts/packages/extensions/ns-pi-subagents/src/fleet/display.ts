import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import {
	compareFleetTasksForDisplay,
	type SubagentFleetRunSnapshot,
	type SubagentFleetTaskSnapshot,
} from "./registry.ts";
import { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUT_LABEL } from "./contract.ts";

export const SUBAGENT_FLEET_WIDGET_KEY = "ns.agents.fleet";
export const SUBAGENT_FLEET_STATUS_KEY = SUBAGENT_FLEET_WIDGET_KEY;
export const SUBAGENT_FLEET_ENTRY_HINT = `${SUBAGENT_FLEET_SHORTCUT_LABEL} · /${SUBAGENT_FLEET_COMMAND_NAME}`;

export interface SubagentFleetDisplayContext {
	readonly hasUI?: boolean;
	readonly ui?: {
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			lines: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
}

export function syncSubagentFleetDisplay(
	ctx: SubagentFleetDisplayContext,
	runs: readonly SubagentFleetRunSnapshot[],
): void {
	const lines = formatSubagentFleetWidgetLines(runs);
	setSubagentFleetWidget(ctx, lines.length === 0 ? undefined : lines);
	setSubagentFleetStatus(ctx, formatSubagentFleetStatusText(runs));
}

/**
 * Ambient widget: one summary line while explorers are active, nothing once the
 * fleet is idle. Per-task detail lives in the fleet navigator, not the widget.
 */
export function formatSubagentFleetWidgetLines(
	runs: readonly SubagentFleetRunSnapshot[],
): string[] {
	const tasks = sortedFleetTasks(runs);
	if (!hasActiveFleetTasks(tasks)) return [];
	return [
		truncatePlain(
			`subagent fleet: ${describeFleetCounts(tasks)} · ${SUBAGENT_FLEET_ENTRY_HINT}`,
			180,
		),
	];
}

export function formatSubagentFleetStatusText(
	runs: readonly SubagentFleetRunSnapshot[],
): string | undefined {
	const tasks = sortedFleetTasks(runs);
	if (!hasActiveFleetTasks(tasks)) return undefined;
	return `subagent fleet: ${describeFleetCounts(tasks)} · ${SUBAGENT_FLEET_SHORTCUT_LABEL}`;
}

/** Multi-line task dump for hosts without an interactive UI. */
export function formatSubagentFleetTaskLines(runs: readonly SubagentFleetRunSnapshot[]): string[] {
	const tasks = sortedFleetTasks(runs);
	if (tasks.length === 0) return [];
	const parentSessionFile = latestParentSessionFile(runs);
	return [
		`subagent fleet: ${describeFleetCounts(tasks)}`,
		...(parentSessionFile === undefined
			? []
			: [truncatePlain(`◉ parent session — ${parentSessionFile}`, 180)]),
		...tasks.map(formatSubagentFleetTaskLine),
	];
}

function describeFleetCounts(tasks: readonly SubagentFleetTaskSnapshot[]): string {
	const running = tasks.filter((task) => task.state === "running").length;
	const queued = tasks.filter((task) => task.state === "queued").length;
	if (running + queued > 0) {
		return queued > 0 ? `${running} running, ${queued} queued` : `${running} running`;
	}
	const failed = tasks.filter((task) => task.finalStatus !== "final-text").length;
	const succeeded = tasks.length - failed;
	return failed > 0 ? `${succeeded} done, ${failed} failed` : `${succeeded} done`;
}

function hasActiveFleetTasks(tasks: readonly SubagentFleetTaskSnapshot[]): boolean {
	return tasks.some((task) => task.state === "running" || task.state === "queued");
}

function setSubagentFleetWidget(
	ctx: SubagentFleetDisplayContext,
	lines: string[] | undefined,
): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui?.setWidget?.(SUBAGENT_FLEET_WIDGET_KEY, lines, { placement: "aboveEditor" });
	} catch {
		// Widget updates are display-only and must not affect subagent execution.
	}
}

function setSubagentFleetStatus(ctx: SubagentFleetDisplayContext, text: string | undefined): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui?.setStatus?.(SUBAGENT_FLEET_STATUS_KEY, text);
	} catch {
		// Status updates are display-only and must not affect subagent execution.
	}
}

function formatSubagentFleetTaskLine(task: SubagentFleetTaskSnapshot): string {
	const icon = taskIcon(task);
	const status = task.finalStatus ?? task.state;
	const suffix = task.sessionFile ?? task.latestActivity;
	return truncatePlain(
		`${icon} ${task.title} — ${status}${suffix === undefined ? "" : ` — ${suffix}`}`,
		180,
	);
}

export function latestParentSessionFile(
	runs: readonly SubagentFleetRunSnapshot[],
): string | undefined {
	return runs
		.map((run) => run.parentSessionFile)
		.filter((file) => file !== undefined)
		.at(-1);
}

export function sortedFleetTasks(
	runs: readonly { tasks: readonly SubagentFleetTaskSnapshot[] }[],
): SubagentFleetTaskSnapshot[] {
	return runs.flatMap((run) => run.tasks).sort(compareFleetTasksForDisplay);
}

export function taskIcon(task: SubagentFleetTaskSnapshot): string {
	if (task.state === "queued") return "·";
	if (task.state === "running") return "▶";
	return task.finalStatus === "final-text" ? "✓" : "✗";
}
