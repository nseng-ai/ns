import type { SdlProgressPhaseEvent } from "@sdl/kernel/sdk";
import type { StatusLineItem } from "@sdl/core/cli-theme";

/** One declared phase: a stable sequencing `key` plus its presentational status-line payload. */
export interface PhaseSpec {
	key: string;
	item: StatusLineItem;
}

/** Checkpoint workflow phases, shared by `flow cp` and submit's folded checkpoint progress. */
export const CHECKPOINT_PHASES: readonly PhaseSpec[] = [
	{
		key: "inspect",
		item: { name: "Inspect", detail: "worktree inspected", label: "inspecting worktree…" },
	},
	{
		key: "generate",
		item: {
			name: "Generate",
			detail: "checkpoint message ready",
			label: "generating checkpoint message…",
		},
	},
	{
		key: "commit",
		item: { name: "Commit", detail: "checkpoint committed", label: "creating checkpoint commit…" },
	},
];

/** Ordered phase list for `flow cp`. Keys match what the checkpoint workflow emits. */
export const CP_PHASES = CHECKPOINT_PHASES;

/** Ordered phase list for `flow land`. Keys match the CLI presentation adapter. */
export const LAND_PHASES: readonly PhaseSpec[] = [
	{
		key: "preflight",
		item: { name: "Preflight", detail: "landing plan ready", label: "checking stack and PRs…" },
	},
	{
		key: "merge",
		item: { name: "Merge", detail: "target PRs merged", label: "merging PRs with GitHub…" },
	},
	{
		key: "refresh",
		item: {
			name: "Refresh",
			detail: "stack refreshed",
			label: "restacking and updating remaining PRs…",
		},
	},
	{
		key: "cleanup",
		item: { name: "Cleanup", detail: "local refs cleaned", label: "cleaning landed branches…" },
	},
];

/** Ordered phase list for `flow submit`. Keys match what the submit driver and graphite emit. */
export const SUBMIT_PHASES: readonly PhaseSpec[] = [
	{
		key: "checkpoint",
		item: {
			name: "Checkpoint",
			detail: "checkpoint complete",
			label: "checkpointing pending changes…",
		},
	},
	{
		key: "preflight",
		item: { name: "Preflight", detail: "ready to submit", label: "checking submit readiness…" },
	},
	{
		key: "metadata",
		item: {
			name: "Metadata",
			detail: "metadata prepared",
			label: "inspecting stack and preparing PR metadata if needed…",
		},
	},
	{
		key: "submit",
		item: {
			name: "Submit",
			detail: "stack submitted",
			label: "running gt submit --no-edit --publish --no-stack --no-ai…",
		},
	},
	{
		key: "verification",
		item: { name: "Verification", detail: "PRs verified", label: "checking submitted PRs…" },
	},
	{
		key: "descriptions",
		item: {
			name: "Descriptions",
			detail: "descriptions ready",
			label: "checking PR descriptions for skip or regeneration…",
		},
	},
];

/**
 * Translate a checkpoint-workflow event (keyed inspect/generate/commit) into a single presentational
 * label, so `flow submit` can fold the whole checkpoint into its one "Checkpoint" phase.
 */
export function checkpointEventLabel(event: SdlProgressPhaseEvent): string | undefined {
	if (event.type === "phase-progress") return event.label;
	if (event.type === "phase-started") {
		if (event.label !== undefined) return event.label;
		return CHECKPOINT_PHASES.find((spec) => spec.key === event.phaseKey)?.item.label;
	}
	return undefined;
}
