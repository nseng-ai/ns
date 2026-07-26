/**
 * Pure, theme-free presentation model for the `/stack:view` overlay: plain-data
 * row/segment structures plus pure transformations that a view component colorizes
 * and lays out. This module
 * performs no I/O, reads no clock, and never touches the Pi TUI runtime.
 *
 * The overlay renders a master/detail layout: a compact list of stack rows
 * (indexing `model.prs`, plus a virtual trunk row) above a scrollable detail
 * pane for the selected PR. The rollup segments and identity line form the
 * header. Row ordering follows the model — `model.prs` is top-of-stack first —
 * and the trunk is carried separately on `model.trunk`.
 */
import { clamp } from "@nseng-ai/pi-runtime/terminal/layout";
import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import {
	CHECK_BUCKET_DISPLAY,
	EXPECTED_GRAPHITE_PENDING_EXPLANATION,
	checkPresentationForPr,
	collapseWhitespace,
	entriesForCheckBucket,
	formatCheckEntryLabel,
	formatThreadDetailLabel,
	partitionPendingChecks,
	stackRowLabel,
	statusWord,
	type StackCheckPresentation,
	type StackThemeColor,
} from "./format.ts";
import type { EnrichmentEntry } from "./enrichment-store.ts";
import type {
	StackViewCheckBucket,
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "./types.ts";

/** The rollup bucket a single stack row lands in for the header tally. */
export type StackRollupBucket = "failing" | "unresolved" | "pending" | "ready" | "draft" | "no-pr";

/**
 * Bucket a PR for the header rollup. The ladder mirrors {@link StackViewPrStatus}
 * priority, but splits "ready" into `pending` when an ordinary or
 * unaccounted pending check still requires attention.
 */
export function rollupBucketForPr(pr: StackViewPr): StackRollupBucket {
	if (pr.status === "no-pr") return "no-pr";
	if (pr.status === "draft") return "draft";
	if (pr.status === "checks-failing") return "failing";
	if (pr.status === "unresolved") return "unresolved";
	if (partitionPendingChecks(pr).ordinaryCount > 0) return "pending";
	return "ready";
}

/** One header rollup segment: display text plus the theme color to render it in. */
export interface StackRollupSegment {
	text: string;
	color: StackThemeColor;
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
		{ text: `${counts.ready} ready to merge`, color: "success" },
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
	checkPresentation: StackCheckPresentation | null;
	statusWord: string;
}

/** Format one stack row into its list cells. Empty strings mean "render nothing". */
export function formatStackRowCells(pr: StackViewPr): StackRowCells {
	return {
		label: stackRowLabel(pr),
		threads: formatThreadsCell(pr),
		checks: formatChecksCell(pr),
		checkPresentation: checkPresentationForPr(pr),
		statusWord: statusWord(pr.status),
	};
}

function formatThreadsCell(pr: StackViewPr): string {
	if (pr.threads.total <= 0) return "";
	return `💬 ${pr.threads.resolved}/${pr.threads.total}`;
}

function formatChecksCell(pr: StackViewPr): string {
	const { passing, failing, pending, cancelled, total } = pr.checks;
	if (total <= 0) return "";
	if (failing > 0) return `✗ ${failing}/${total}`;
	const partition = partitionPendingChecks(pr);
	if (partition.ordinaryCount > 0) return `⋯ ${pending}/${total}`;
	if (partition.expectedCount > 0) return `⋯ ${partition.expectedCount} expected`;
	if (cancelled > 0) return `⊘ ${cancelled}/${total}`;
	return `✓ ${passing}/${total}`;
}

/**
 * Number of rows the list region gets: roughly 30% of the body, at least 3
 * preferred, but never more than the row count and never below 1. The shared
 * `clamp` returns its `min` when `max < min`, so a tiny-terminal upper bound of
 * `bodyRows - 5` collapses cleanly to the 1-row floor.
 */
export function stackListRows(options: { bodyRows: number; rowCount: number }): number {
	const preferred = Math.max(3, Math.floor(options.bodyRows * 0.3));
	return clamp(Math.min(options.rowCount, preferred), 1, options.bodyRows - 5);
}

/** The semantic role of a detail-pane row; the view maps each role to a theme color. */
export type StackDetailRole =
	| "identity"
	| "branch"
	| "url"
	| "section"
	| "check-failing"
	| "check-pending"
	| "check-expected-pending"
	| "check-cancelled"
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
	appendCancelledChecks(rows, pr);
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
	appendCheckSection(rows, pr, {
		bucket: "failing",
		heading: "FAILING CHECKS",
		onEntry: (entry) => appendCheckWhy(rows, entry, enrichment),
	});
}

/** Append the enrichment follow-on rows for one failing check, if any. */
function appendCheckWhy(
	rows: StackDetailRow[],
	entry: StackViewCheckEntry,
	enrichment: ReadonlyMap<string, EnrichmentEntry> | undefined,
): void {
	appendEnrichmentFollowOn(rows, checkEnrichmentKey(entry), enrichment, (summary) => {
		const lines = summary
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.slice(0, 3);
		const [first, ...rest] = lines;
		if (first === undefined) return [];
		return [
			{ role: "check-why", text: `  ↳ why: ${first}` },
			...rest.map((line) => ({ role: "check-why" as const, text: `     ${line}` })),
		];
	});
}

/** List canceled check entries under their own section; omitted when zero. Cancelled never blocks. */
function appendCancelledChecks(rows: StackDetailRow[], pr: StackViewPr): void {
	appendCheckSection(rows, pr, { bucket: "cancelled", heading: "CANCELLED CHECKS" });
}

/** List completed passing check entries under their own section; omitted when zero. */
function appendPassingChecks(rows: StackDetailRow[], pr: StackViewPr): void {
	appendCheckSection(rows, pr, { bucket: "passing", heading: "PASSING CHECKS" });
}

function appendPendingChecks(rows: StackDetailRow[], pr: StackViewPr): void {
	const pending = partitionPendingChecks(pr);
	if (pending.ordinaryCount > 0) {
		rows.push({ role: "section", text: `PENDING CHECKS (${pending.ordinaryCount})` });
		for (const entry of pending.ordinaryEntries) {
			rows.push({ role: "check-pending", text: `⋯ ${formatCheckEntryLabel(entry)}` });
		}
		if (pending.unaccountedOrdinaryCount > 0) {
			rows.push({
				role: "truncation-note",
				text: `… ${pending.unaccountedOrdinaryCount} pending checks not fetched`,
			});
		}
	}
	if (pending.expectedEntries.length === 0) return;
	rows.push({
		role: "section",
		text: `EXPECTED PENDING CHECKS (${pending.expectedEntries.length})`,
	});
	for (const entry of pending.expectedEntries) {
		rows.push({ role: "check-expected-pending", text: `⋯ ${formatCheckEntryLabel(entry)}` });
		rows.push({
			role: "check-expected-pending",
			text: `  ↳ ${EXPECTED_GRAPHITE_PENDING_EXPLANATION}`,
		});
	}
}

function appendCheckSection(
	rows: StackDetailRow[],
	pr: StackViewPr,
	options: {
		bucket: StackViewCheckBucket;
		heading: string;
		onEntry?: (entry: StackViewCheckEntry) => void;
	},
): void {
	const entries = entriesForCheckBucket(pr.checkEntries, options.bucket);
	if (entries.length === 0) return;
	const display = CHECK_BUCKET_DISPLAY[options.bucket];
	rows.push({ role: "section", text: `${options.heading} (${entries.length})` });
	for (const entry of entries) {
		rows.push({ role: display.role, text: `${display.glyph} ${formatCheckEntryLabel(entry)}` });
		options.onEntry?.(entry);
	}
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
		rows.push({ role: "thread", text: formatThreadDetailLabel(thread) });
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
	const key = threadEnrichmentKey(thread);
	if (key === null) return;
	appendEnrichmentFollowOn(rows, key, enrichment, (summary) => [
		{ role: "thread-summary", text: `  ↳ asks: ${collapseWhitespace(summary)}` },
	]);
}

function appendEnrichmentFollowOn(
	rows: StackDetailRow[],
	key: string,
	enrichment: ReadonlyMap<string, EnrichmentEntry> | undefined,
	formatReady: (summary: string) => StackDetailRow[],
): void {
	if (enrichment === undefined) return;
	const result = enrichment.get(key);
	if (result === undefined) return;
	if (result.state === "pending") {
		rows.push({ role: "summary-pending", text: "  …summarizing" });
		return;
	}
	if (result.state !== "ready") return;
	rows.push(...formatReady(result.summary));
}

function appendObjectives(rows: StackDetailRow[], pr: StackViewPr): void {
	if (pr.objectiveSlugs.length === 0) return;
	rows.push({ role: "objectives", text: `objectives: ${pr.objectiveSlugs.join(", ")}` });
}
