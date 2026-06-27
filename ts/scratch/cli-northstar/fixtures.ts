// THROWAWAY steelthread harness — fixtures.
//
// Shapes mirror the real commands so the rendering is faithful:
//  - ObjectiveRow mirrors @sdl/objective `ObjectiveListRecord`
//    ({ slug, status: "open"|"closed", latestUpdateIso, updatedBranches?, hasOutstandingChanges }).
//  - SubmitPhase mirrors the `flow submit` streaming phase sequence, including the live
//    `gt submit` subprocess lines that drive the log-tail.

// Anchored "now" for relative-time rendering, so the prototype output is stable across runs.
export const NOW_ISO = "2026-06-27T12:00:00Z";

export interface ObjectiveRow {
	slug: string;
	status: "open" | "closed";
	latestUpdateIso: string | null;
	updatedBranches?: string[];
	hasOutstandingChanges: boolean;
}

export const OBJECTIVE_ROWS: readonly ObjectiveRow[] = [
	{
		slug: "cli-ux-north-star",
		status: "open",
		latestUpdateIso: "2026-06-27T05:05:00Z",
		updatedBranches: ["1/2 add-cli-ux-north-star-objective", "1/2 cli-northstar-proto"],
		hasOutstandingChanges: true,
	},
	{ slug: "cli-surface-conformance-remediation", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
	{ slug: "clinkr-shell-completion", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
	{
		slug: "cross-harness-parity",
		status: "open",
		latestUpdateIso: "2026-06-13T09:10:00Z",
		hasOutstandingChanges: false,
	},
	{ slug: "repo-ontology", status: "open", latestUpdateIso: "2026-06-26T12:27:25Z", hasOutstandingChanges: true },
	{
		slug: "ts-cli-core-structural-cleanup",
		status: "open",
		latestUpdateIso: "2026-06-24T17:00:00Z",
		hasOutstandingChanges: false,
	},
	{ slug: "vibechk-v1", status: "closed", latestUpdateIso: "2026-06-18T17:53:00Z", hasOutstandingChanges: false },
];

export interface SubmitPhase {
	key: string;
	/** Active-marker label, mirroring the real `• <label>` stderr markers. */
	label: string;
	/** Settled-state label for the in-place renderer. */
	done: string;
	skipped?: boolean;
	/** Live subprocess lines for the streaming Submit phase; the latest is the log-tail. */
	logLines?: string[];
}

export const SUBMIT_PHASES: readonly SubmitPhase[] = [
	{ key: "preflight", label: "Preflight: checking Graphite submit readiness…", done: "Graphite submit readiness" },
	{ key: "restack", label: "Preflight: running gt restack…", done: "restack not required", skipped: true },
	{ key: "metadata", label: "Metadata: preparing PR metadata before submit…", done: "PR metadata prepared" },
	{
		key: "submit",
		label: "Submit: running gt submit…",
		done: "2 PRs submitted",
		logLines: [
			"Validating 2 branches in stack…",
			"Pushing add-cli-ux-north-star-objective → origin…",
			"Creating PR for add-cli-ux-north-star-objective…",
			"Pushing cli-northstar-proto → origin…",
			"Updating PR for cli-northstar-proto…",
		],
	},
	{ key: "verification", label: "Verification: checking submitted PR…", done: "PRs verified" },
	{
		key: "descriptions",
		label: "Descriptions: generating or validating PR descriptions…",
		done: "descriptions validated",
	},
];

export interface SubmittedPr {
	branch: string;
	number: number;
	action: "created" | "updated";
	url: string;
}

export const SUBMITTED_PRS: readonly SubmittedPr[] = [
	{
		branch: "add-cli-ux-north-star-objective",
		number: 2201,
		action: "created",
		url: "https://github.com/example/sdl-tools/pull/2201",
	},
	{
		branch: "cli-northstar-proto",
		number: 2202,
		action: "updated",
		url: "https://github.com/example/sdl-tools/pull/2202",
	},
];

export interface SubmitFailure {
	phaseKey: string;
	summary: string;
	logPath: string;
	transcriptTail: string[];
}

export const SUBMIT_FAILURE: SubmitFailure = {
	phaseKey: "submit",
	summary: "gt submit failed: remote rejected push (protected branch rule)",
	logPath: ".sdl/logs/flow-submit-20260627T0507.log",
	transcriptTail: [
		"remote: error: GH006: Protected branch update failed for refs/heads/master.",
		"remote: error: Required status check \"ci/build\" is expected.",
		"To github.com:example/sdl-tools.git",
		"! [remote rejected] master -> master (protected branch hook declined)",
	],
};
