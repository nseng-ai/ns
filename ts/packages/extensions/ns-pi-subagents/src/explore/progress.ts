import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type { ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import {
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";
import type { ExploreTaskState } from "./types.ts";

interface ExploreProgressDetails {
	status: "running";
	done: number;
	running: number;
	taskCount: number;
}

interface ExploreTaskProgressView {
	status: string;
	activityText?: string;
}

/**
 * Live progress for the explore tool block itself. Ambient widget/status
 * rendering is owned by the fleet display (`syncExploreFleetDisplay`).
 */
export function emitExploreProgress(
	states: readonly ExploreTaskState[],
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
): void {
	onUpdate?.({
		content: [{ type: "text", text: renderExploreProgress(states) }],
		details: exploreProgressDetails(states),
	});
}

function exploreProgressDetails(states: readonly ExploreTaskState[]): ExploreProgressDetails {
	return {
		status: "running",
		done: states.filter((state) => state.state === "done").length,
		running: states.filter((state) => state.state === "running").length,
		taskCount: states.length,
	};
}

function exploreTaskProgressView(state: ExploreTaskState): ExploreTaskProgressView {
	if (state.outcome !== undefined) {
		return { status: state.outcome.result.status };
	}
	if (state.state === "queued") return { status: "queued" };

	const update = state.latestUpdate;
	if (update === undefined) return { status: "running" };
	const activityText = activityDescription(update);
	return {
		status: update.progress.state,
		...optionalEntries({ activityText }),
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
