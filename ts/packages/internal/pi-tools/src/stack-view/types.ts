/**
 * Domain model for the `/stack:view` panel plus the pure merge-readiness
 * derivation. This module is intentionally dependency-light: it holds only
 * plain-data shapes and pure transformations so downstream data/render modules
 * can depend on it without pulling in exec or GraphQL concerns.
 */

/** Review-thread resolution counts for a single PR. */
export interface StackViewPrThreads {
	resolved: number;
	total: number;
}

/** CI check-run counts for a single PR. */
export interface StackViewPrChecks {
	passing: number;
	failing: number;
	pending: number;
	total: number;
}

/** Which rollup bucket a named check landed in. Upstream `unknown` is folded into `pending`. */
export type StackViewCheckBucket = "passing" | "failing" | "pending";

/** One named CI check for the detail pane. */
export interface StackViewCheckEntry {
	name: string;
	workflowName: string | null;
	bucket: StackViewCheckBucket;
}

/** One unresolved review thread for the detail pane. `line` is null for file-level comments. */
export interface StackViewThreadDetail {
	path: string;
	line: number | null;
	author: string | null;
}

/**
 * Derived merge-readiness of a stack row, in priority order:
 * no PR, draft, checks failing, unresolved review threads, otherwise ready.
 */
export type StackViewPrStatus = "draft" | "checks-failing" | "unresolved" | "ready" | "no-pr";

/** One row of the stack view: a branch and its associated PR (if any). */
export interface StackViewPr {
	branch: string;
	parentBranch: string;
	number: number | null;
	title: string;
	url: string;
	graphiteUrl: string;
	isDraft: boolean;
	body: string;
	threads: StackViewPrThreads;
	checks: StackViewPrChecks;
	/** Named check entries backing the detail pane. */
	checkEntries: StackViewCheckEntry[];
	/** Unresolved-thread locations, limited to the first 100 fetched threads. */
	unresolvedThreads: StackViewThreadDetail[];
	status: StackViewPrStatus;
	objectiveSlugs: string[];
}

/**
 * The full stack-view model. `prs` is ordered top-of-stack first; the trunk is
 * carried as a name and rendered separately from the PR rows.
 */
export interface StackViewModel {
	trunk: string;
	currentBranch: string;
	prs: StackViewPr[];
	owner: string;
	repo: string;
	objectivesBySlug: Map<string, number[]>;
}

/** Narrow input for {@link deriveStatus}: only the fields the derivation reads. */
export interface StackViewStatusInput {
	number: number | null;
	isDraft: boolean;
	checks: Pick<StackViewPrChecks, "failing">;
	threads: StackViewPrThreads;
}

/**
 * Pure merge-readiness derivation. Priority order: no PR wins, then draft, then
 * any failing check, then any unresolved review thread, otherwise ready.
 */
export function deriveStatus(input: StackViewStatusInput): StackViewPrStatus {
	if (input.number === null) return "no-pr";
	if (input.isDraft) return "draft";
	if (input.checks.failing > 0) return "checks-failing";
	if (input.threads.total - input.threads.resolved > 0) return "unresolved";
	return "ready";
}
