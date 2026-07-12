import type { StatusLineItem } from "@nseng-ai/foundation/cli-theme";
import type { NsProgressPhaseInfo } from "@nseng-ai/sdk";

/**
 * One declared phase: a stable sequencing `key` plus its presentational status-line payload.
 * `substeps` supports one declared child level; nesting substeps beyond that is not rendered.
 */
export interface PhaseSubstepSpec {
	key: string;
	item: StatusLineItem;
}

export interface PhaseSpec {
	key: string;
	item: StatusLineItem;
	substeps?: readonly PhaseSubstepSpec[];
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

/**
 * Leading `flow submit` phase for consumer-configured pre-submit checks. Included only when the
 * repo's ns.toml configures checks, so check-free repos keep their existing settled frame.
 */
export const SUBMIT_CHECKS_PHASE: PhaseSpec = {
	key: "checks",
	item: {
		name: "Checks",
		detail: "pre-submit checks passed",
		label: "running pre-submit checks…",
	},
};

/** Submit phases that run before the optional consumer check boundary. */
export const SUBMIT_PRE_CHECK_PHASES: readonly PhaseSpec[] = [
	{
		key: "inventory",
		item: {
			name: "Inventory",
			detail: "stack inventoried",
			label: "reading submit stack topology…",
		},
	},
];

/** Submit phases that run after the optional consumer check boundary. */
export const SUBMIT_CORE_PHASES: readonly PhaseSpec[] = [
	{
		key: "checkpoint",
		item: {
			name: "Checkpoint",
			detail: "checkpoint complete",
			label: "checkpointing pending changes…",
		},
		substeps: CHECKPOINT_PHASES,
	},
	{
		key: "preflight",
		item: { name: "Preflight", detail: "ready to submit", label: "checking submit readiness…" },
	},
	{
		key: "restack",
		item: { name: "Restack", detail: "not required", label: "running gt restack…" },
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

/** Check-free submit phase order. */
export const SUBMIT_PHASES: readonly PhaseSpec[] = [
	...SUBMIT_PRE_CHECK_PHASES,
	...SUBMIT_CORE_PHASES,
];

/** Check-enabled submit phase order. */
export const SUBMIT_PHASES_WITH_CHECKS: readonly PhaseSpec[] = [
	...SUBMIT_PRE_CHECK_PHASES,
	SUBMIT_CHECKS_PHASE,
	...SUBMIT_CORE_PHASES,
];

export function progressPhaseInfos(specs: readonly PhaseSpec[]): readonly NsProgressPhaseInfo[] {
	return specs.map((spec) => ({
		key: spec.key,
		name: spec.item.name,
		...(spec.item.label === undefined ? {} : { label: spec.item.label }),
		...(spec.item.detail === undefined ? {} : { detail: spec.item.detail }),
		...(spec.substeps === undefined ? {} : { substeps: progressPhaseInfos(spec.substeps) }),
	}));
}
