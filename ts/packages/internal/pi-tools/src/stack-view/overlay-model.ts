/**
 * Pure, theme-free presentation model for the `/stack:view` overlay. Mirrors the
 * shape of `preview-feedback-model.ts`: plain-data row/segment structures plus
 * pure transformations that a view component colorizes and lays out. This module
 * performs no I/O, reads no clock, and never touches the Pi TUI runtime.
 *
 * The overlay renders a master/detail layout: a compact list of stack rows
 * (indexing `model.prs`, plus a virtual trunk row) above a scrollable detail
 * pane for the selected PR. The rollup segments and identity line form the
 * header. Row ordering follows the model — `model.prs` is top-of-stack first —
 * and the trunk is carried separately on `model.trunk`.
 */
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { clamp } from "@nseng-ai/pi/terminal/layout";
import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import type { EnrichmentEntry } from "./enrichment-store.ts";
import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "./types.ts";

/**
 * Overlay height budget. Duplicated locally from the pr-previews overlay
 * constants rather than imported: the stack-view subpackage stays decoupled from
 * `src/pr-previews`, so we mirror the same host-overlay clip budget here.
 */
export const STACK_OVERLAY_MAX_HEIGHT_RATIO = 0.85;
export const STACK_OVERLAY_MARGIN = 1;

/** The rollup bucket a single stack row lands in for the header tally. */
export type StackRollupBucket = "failing" | "unresolved" | "pending" | "ready" | "draft" | "no-pr";

/**
 * Bucket a PR for the header rollup. The ladder mirrors {@link StackViewPrStatus}
 * priority, but splits "ready" into `pending` (checks still running) and `ready`.
 */
export function rollupBucketForPr(pr: StackViewPr): StackRollupBucket {
	if (pr.status === "no-pr") return "no-pr";
	if (pr.status === "draft") return "draft";
	if (pr.status === "checks-failing") return "failing";
	if (pr.status === "unresolved") return "unresolved";
	if (pr.checks.pending > 0) return "pending";
	return "ready";
}

/** One header rollup segment: display text plus the theme color name to render it in. */
export interface StackRollupSegment {
	text: string;
	color: string;
}

/**
 * Build the header rollup segments. The five core segments (total, failing,
 * unresolved, pending, ready) always appear; the draft and no-pr segments appear
 * only when their count is nonzero.
 */
export function buildStackRollupSegments(model: StackViewModel): StackRollupSegment[] {
	const counts: Record<StackRollupBucket, number> = {
		failing: 0,
		unresolved: 0,
		pending: 0,
		ready: 0,
		draft: 0,
		"no-pr": 0,
	};
	for (const pr of model.prs) counts[rollupBucketForPr(pr)] += 1;

	const segments: StackRollupSegment[] = [
		{ text: `${model.prs.length} PRs`, color: "text" },
		{ text: `${counts.failing} failing`, color: "error" },
		{ text: `${counts.unresolved} unresolved`, color: "warning" },
		{ text: `${counts.pending} pending`, color: "warning" },
		{ text: `${counts.ready} ready`, color: "success" },
	];
	if (counts.draft > 0) segments.push({ text: `${counts.draft} draft`, color: "muted" });
	if (counts["no-pr"] > 0) segments.push({ text: `${counts["no-pr"]} no-pr`, color: "dim" });
	return segments;
}

/** The single-line repo/trunk/branch identity shown as the first header line. */
export function buildStackIdentityLine(model: StackViewModel): string {
	return `${model.owner}/${model.repo} · trunk ${model.trunk} · on ${model.currentBranch}`;
}

/** The four fixed cells of one list row: label plus right-hand threads/checks/status cells. */
export interface StackRowCells {
	label: string;
	threads: string;
	checks: string;
	statusWord: string;
}

/** Format one stack row into its list cells. Empty strings mean "render nothing". */
export function formatStackRowCells(pr: StackViewPr): StackRowCells {
	return {
		label:
			pr.number === null ? `(no PR) ${pr.branch}` : `#${pr.number} ${collapseWhitespace(pr.title)}`,
		threads: formatThreadsCell(pr),
		checks: formatChecksCell(pr),
		statusWord: statusWord(pr),
	};
}

function formatThreadsCell(pr: StackViewPr): string {
	if (pr.threads.total <= 0) return "";
	return `💬 ${pr.threads.resolved}/${pr.threads.total}`;
}

function formatChecksCell(pr: StackViewPr): string {
	const { passing, failing, pending, total } = pr.checks;
	if (total <= 0) return "";
	if (failing > 0) return `✗ ${failing}/${total}`;
	if (pending > 0) return `⋯ ${pending}/${total}`;
	return `✓ ${passing}/${total}`;
}

/** The one-word status label. Kept local to the overlay model; do not import render.ts. */
function statusWord(pr: StackViewPr): string {
	switch (pr.status) {
		case "draft":
			return "draft";
		case "checks-failing":
			return "checks failing";
		case "unresolved":
			return "unresolved";
		case "ready":
			return "ready";
		case "no-pr":
			return "no-pr";
	}
}

/**
 * Number of rows the list region gets: roughly 30% of the body, at least 3, but
 * never more than the row count and never below 1. The `Math.max(1, …)` upper
 * bound is deliberate — the pr-previews original can compute a negative upper
 * bound on tiny terminals; this guard avoids reproducing that bug.
 */
export function stackListRows(options: { bodyRows: number; rowCount: number }): number {
	const preferred = Math.max(3, Math.floor(options.bodyRows * 0.3));
	return clamp(Math.min(options.rowCount, preferred), 1, Math.max(1, options.bodyRows - 5));
}

/** The semantic role of a detail-pane row; the view maps each role to a theme color. */
export type StackDetailRole =
	| "identity"
	| "branch"
	| "url"
	| "section"
	| "check-failing"
	| "check-pending"
	| "thread"
	| "summary-pending"
	| "thread-summary"
	| "check-why"
	| "check-passing"
	| "truncation-note"
	| "objectives"
	| "placeholder"
	| "spacer";

/** One line of the detail pane, tagged with its role for colorization. */
export interface StackDetailRow {
	role: StackDetailRole;
	text: string;
}

/**
 * Build the detail-pane rows for the selected stack row. Empty sections are
 * omitted entirely. A missing or PR-less row renders a placeholder (plus its
 * objectives line, if any).
 *
 * When an `enrichment` snapshot is supplied it progressively augments the bare
 * rows: each unresolved thread and each failing check gains a summary follow-on
 * row keyed by {@link threadEnrichmentKey} / {@link checkEnrichmentKey} — a
 * `…summarizing` placeholder while `pending`, an `↳ asks:` / `↳ why:` line once
 * `ready`, and nothing when `failed` or absent (the bare row degrades cleanly).
 * Passing check entries are listed under their own `PASSING CHECKS` section.
 */
export function buildStackDetailRows(
	pr: StackViewPr | undefined,
	enrichment?: ReadonlyMap<string, EnrichmentEntry>,
): StackDetailRow[] {
	if (pr === undefined) return [{ role: "placeholder", text: "(no PR selected)" }];
	if (pr.number === null) {
		const rows: StackDetailRow[] = [
			{ role: "placeholder", text: `(no PR for branch ${pr.branch})` },
		];
		appendObjectives(rows, pr);
		return rows;
	}

	const rows: StackDetailRow[] = [];
	rows.push({ role: "identity", text: `#${pr.number} ${collapseWhitespace(pr.title)}` });
	rows.push({ role: "branch", text: `branch: ${pr.branch} → ${pr.parentBranch}` });
	if (pr.graphiteUrl.length > 0) rows.push({ role: "url", text: pr.graphiteUrl });
	rows.push({ role: "spacer", text: "" });

	appendFailingChecks(rows, pr, enrichment);
	appendUnresolvedThreads(rows, pr, enrichment);
	appendPendingChecks(rows, pr);
	appendPassingChecks(rows, pr);

	if (pr.objectiveSlugs.length > 0) {
		rows.push({ role: "spacer", text: "" });
		appendObjectives(rows, pr);
	}
	return rows;
}

function appendFailingChecks(
	rows: StackDetailRow[],
	pr: StackViewPr,
	enrichment?: ReadonlyMap<string, EnrichmentEntry>,
): void {
	const failing = pr.checkEntries.filter((entry) => entry.bucket === "failing");
	if (failing.length === 0) return;
	rows.push({ role: "section", text: `FAILING CHECKS (${failing.length})` });
	for (const entry of failing) {
		rows.push({ role: "check-failing", text: `✗ ${checkEntryLabel(entry)}` });
		appendCheckWhy(rows, entry, enrichment);
	}
}

/** Append the enrichment follow-on rows for one failing check, if any. */
function appendCheckWhy(
	rows: StackDetailRow[],
	entry: StackViewCheckEntry,
	enrichment: ReadonlyMap<string, EnrichmentEntry> | undefined,
): void {
	if (enrichment === undefined) return;
	const result = enrichment.get(checkEnrichmentKey(entry));
	if (result === undefined) return;
	if (result.state === "pending") {
		rows.push({ role: "summary-pending", text: "  …summarizing" });
		return;
	}
	if (result.state !== "ready") return; // failed: the bare ✗ row degrades.
	const lines = result.summary
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, 3);
	const [first, ...rest] = lines;
	if (first === undefined) return;
	rows.push({ role: "check-why", text: `  ↳ why: ${first}` });
	for (const line of rest) rows.push({ role: "check-why", text: `     ${line}` });
}

/** List completed passing check entries under their own section; omitted when zero. */
function appendPassingChecks(rows: StackDetailRow[], pr: StackViewPr): void {
	const passing = pr.checkEntries.filter((entry) => entry.bucket === "passing");
	if (passing.length === 0) return;
	rows.push({ role: "section", text: `PASSING CHECKS (${passing.length})` });
	for (const entry of passing)
		rows.push({ role: "check-passing", text: `✓ ${checkEntryLabel(entry)}` });
}

function appendPendingChecks(rows: StackDetailRow[], pr: StackViewPr): void {
	const pending = pr.checkEntries.filter((entry) => entry.bucket === "pending");
	if (pending.length === 0) return;
	rows.push({ role: "section", text: `PENDING CHECKS (${pending.length})` });
	for (const entry of pending)
		rows.push({ role: "check-pending", text: `⋯ ${checkEntryLabel(entry)}` });
}

function checkEntryLabel(entry: { name: string; workflowName: string | null }): string {
	return entry.workflowName === null ? entry.name : `${entry.name} (${entry.workflowName})`;
}

function appendUnresolvedThreads(
	rows: StackDetailRow[],
	pr: StackViewPr,
	enrichment?: ReadonlyMap<string, EnrichmentEntry>,
): void {
	const unresolvedCount = pr.threads.total - pr.threads.resolved;
	if (unresolvedCount <= 0) return;
	rows.push({ role: "section", text: `UNRESOLVED THREADS (${unresolvedCount})` });
	for (const thread of pr.unresolvedThreads) {
		rows.push({ role: "thread", text: formatThreadLocation(thread) });
		appendThreadSummary(rows, thread, enrichment);
	}
	const missing = unresolvedCount - pr.unresolvedThreads.length;
	if (missing > 0) {
		rows.push({ role: "truncation-note", text: `… ${missing} more not fetched` });
	}
}

/** Append the enrichment follow-on row for one unresolved thread, if any. */
function appendThreadSummary(
	rows: StackDetailRow[],
	thread: StackViewThreadDetail,
	enrichment: ReadonlyMap<string, EnrichmentEntry> | undefined,
): void {
	if (enrichment === undefined) return;
	const key = threadEnrichmentKey(thread);
	if (key === null) return;
	const result = enrichment.get(key);
	if (result === undefined) return;
	if (result.state === "pending") {
		rows.push({ role: "summary-pending", text: "  …summarizing" });
		return;
	}
	if (result.state !== "ready") return; // failed: the bare thread row degrades.
	rows.push({ role: "thread-summary", text: `  ↳ asks: ${collapseWhitespace(result.summary)}` });
}

function formatThreadLocation(thread: {
	path: string;
	line: number | null;
	author: string | null;
}): string {
	const location = thread.path.length === 0 ? "(file unknown)" : thread.path;
	const withLine = thread.line === null ? location : `${location}:${thread.line}`;
	return thread.author === null ? withLine : `${withLine} · ${thread.author}`;
}

function appendObjectives(rows: StackDetailRow[], pr: StackViewPr): void {
	if (pr.objectiveSlugs.length === 0) return;
	rows.push({ role: "objectives", text: `objectives: ${pr.objectiveSlugs.join(", ")}` });
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/** Viewport slice for the detail pane. Duplicated locally from the pr-previews idiom. */
export interface StackDetailViewportOptions {
	lines: readonly string[];
	width: number;
	rows: number;
	scroll: number;
}

/** The visible slice of wrapped detail lines plus the resolved scroll bounds. */
export interface StackDetailViewport {
	lines: string[];
	scroll: number;
	maxScroll: number;
}

/**
 * Wrap each detail line to `width`, preserving blank lines. Mirrors the
 * pr-previews `wrapDetailLines` idiom; duplicated to keep the subpackage
 * decoupled.
 */
export function wrapStackDetailLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		if (line === "") return [""];
		const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
		return wrapped.length === 0 ? [""] : wrapped;
	});
}

/** Wrap the detail lines, clamp the scroll to the wrapped bounds, and slice the visible rows. */
export function sliceStackDetailLinesForViewport(
	options: StackDetailViewportOptions,
): StackDetailViewport {
	const wrapped = wrapStackDetailLines(options.lines, options.width);
	const maxScroll = Math.max(0, wrapped.length - options.rows);
	const scroll = clamp(options.scroll, 0, maxScroll);
	return {
		lines: wrapped.slice(scroll, scroll + options.rows),
		scroll,
		maxScroll,
	};
}
