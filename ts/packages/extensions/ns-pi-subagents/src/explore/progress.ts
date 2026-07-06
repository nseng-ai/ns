import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import type { ToolContext, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import {
	runnerSubagentPrimaryActivityPreview,
	setRunnerSubagentWidget,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";
import { sessionFileFor } from "./result.ts";
import type { ExploreTaskState } from "./types.ts";

export const EXPLORE_PROGRESS_WIDGET_KEY = "ns.explore.progress";

interface ExploreProgressDetails {
	status: "running";
	done: number;
	running: number;
	taskCount: number;
}

interface ExploreTaskProgressView {
	icon: string;
	status: string;
	activityText?: string;
	sessionFile?: string;
}

export function emitExploreProgress(
	ctx: ToolContext,
	states: readonly ExploreTaskState[],
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
): void {
	onUpdate?.({
		content: [{ type: "text", text: renderExploreProgress(states) }],
		details: exploreProgressDetails(states),
	});
	setRunnerSubagentWidget(
		ctx,
		EXPLORE_PROGRESS_WIDGET_KEY,
		formatExploreProgressWidgetLines(states),
	);
}

function exploreProgressDetails(states: readonly ExploreTaskState[]): ExploreProgressDetails {
	return {
		status: "running",
		done: states.filter((state) => state.state === "done").length,
		running: states.filter((state) => state.state === "running").length,
		taskCount: states.length,
	};
}

function formatExploreProgressWidgetLines(states: readonly ExploreTaskState[]): string[] {
	const details = exploreProgressDetails(states);
	return [
		`explore: ${details.done}/${details.taskCount} done, ${details.running} running`,
		...states.map((state, index) => formatExploreTaskWidgetLine(state, index)),
	];
}

function formatExploreTaskWidgetLine(state: ExploreTaskState, index: number): string {
	const description = exploreTaskProgressView(state);
	const suffixText = description.sessionFile ?? description.activityText;
	const suffix = suffixText === undefined ? "" : ` — ${suffixText}`;
	return truncatePlain(
		`${description.icon} ${index + 1}. ${state.input.title} — ${description.status}${suffix}`,
		180,
	);
}

function exploreTaskProgressView(state: ExploreTaskState): ExploreTaskProgressView {
	if (state.outcome !== undefined) {
		const sessionFile = sessionFileFor(state.outcome.result);
		return {
			icon: state.outcome.result.status === "final-text" ? "✓" : "✗",
			status: state.outcome.result.status,
			...(sessionFile === undefined ? {} : { sessionFile }),
		};
	}
	if (state.state === "queued") return { icon: "·", status: "queued" };

	const update = state.latestUpdate;
	if (update === undefined) return { icon: "▶", status: "running" };
	const activityText = activityDescription(update);
	return {
		icon: "▶",
		status: update.progress.state,
		...(activityText === undefined ? {} : { activityText }),
	};
}

function activityDescription(update: RunnerSubagentUpdate): string | undefined {
	const preview = runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined) return preview;
	if (update.progress.currentTool !== undefined) return update.progress.currentTool;
	if (update.progress.turnCount > 0) return `turn ${update.progress.turnCount}`;
	return undefined;
}

function renderExploreProgress(states: readonly ExploreTaskState[]): string {
	const details = exploreProgressDetails(states);
	const summaries = states.map(renderExploreTaskProgress).join("; ");
	return truncatePlain(
		`explore: ${details.done}/${details.taskCount} done, ${details.running} running — ${summaries}`,
		320,
	);
}

function renderExploreTaskProgress(state: ExploreTaskState): string {
	const description = exploreTaskProgressView(state);
	if (description.activityText === undefined) return `${state.input.title} ${description.status}`;
	return `${state.input.title} ${description.status}: ${description.activityText}`;
}
