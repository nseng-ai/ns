import type {
	StackViewCheckBucket,
	StackViewCheckEntry,
	StackViewPr,
	StackViewPrStatus,
	StackViewThreadDetail,
} from "./types.ts";

export type StackThemeColor =
	| "text"
	| "muted"
	| "accent"
	| "warning"
	| "error"
	| "success"
	| "dim"
	| "border";

export const STACK_STATUS_DISPLAY: Record<
	StackViewPrStatus,
	{ word: string; color: StackThemeColor }
> = {
	draft: { word: "draft", color: "muted" },
	"checks-failing": { word: "checks failing", color: "error" },
	unresolved: { word: "unresolved", color: "warning" },
	ready: { word: "ready to merge", color: "success" },
	"no-pr": { word: "no-pr", color: "dim" },
};

export const CHECK_BUCKET_DISPLAY: Record<
	StackViewCheckBucket,
	{
		glyph: string;
		role: "check-failing" | "check-pending" | "check-cancelled" | "check-passing";
		color: StackThemeColor;
	}
> = {
	failing: { glyph: "✗", role: "check-failing", color: "error" },
	pending: { glyph: "⋯", role: "check-pending", color: "warning" },
	cancelled: { glyph: "⊘", role: "check-cancelled", color: "muted" },
	passing: { glyph: "✓", role: "check-passing", color: "success" },
};

export function stackRowLabel(row: StackViewPr): string {
	if (row.number === null) return `(no PR) ${row.branch}`;
	return `#${row.number} ${row.branch}`;
}

export function statusWord(status: StackViewPrStatus): string {
	return STACK_STATUS_DISPLAY[status].word;
}

export function statusColor(status: StackViewPrStatus): StackThemeColor {
	return STACK_STATUS_DISPLAY[status].color;
}

export type StackCheckPresentation = StackViewCheckBucket | "expected-pending";

export const EXPECTED_GRAPHITE_PENDING_EXPLANATION = "passes as downstack PRs merge";

const GRAPHITE_MERGEABILITY_CHECK_NAME = "Graphite / mergeability_check";
const GRAPHITE_MERGEABILITY_CHECK_IDENTITY = "status-context:Graphite / mergeability_check";

export interface PendingCheckPartition {
	expectedEntries: StackViewCheckEntry[];
	ordinaryEntries: StackViewCheckEntry[];
	expectedCount: number;
	ordinaryCount: number;
	unaccountedOrdinaryCount: number;
}

/** Recognize only Graphite's exact pending trailing status context. */
export function isExpectedGraphitePendingCheck(entry: StackViewCheckEntry): boolean {
	if (entry.bucket !== "pending") return false;
	if (entry.identity === GRAPHITE_MERGEABILITY_CHECK_IDENTITY) return true;
	return entry.identity === null && entry.name === GRAPHITE_MERGEABILITY_CHECK_NAME;
}

/**
 * Partition fetched pending entries while conservatively treating aggregate
 * pending counts that have no fetched entry as ordinary pending work.
 */
export function partitionPendingChecks(
	pr: Pick<StackViewPr, "checks" | "checkEntries">,
): PendingCheckPartition {
	const pendingEntries = pr.checkEntries.filter((entry) => entry.bucket === "pending");
	const expectedEntries = pendingEntries.filter(isExpectedGraphitePendingCheck);
	const ordinaryEntries = pendingEntries.filter((entry) => !isExpectedGraphitePendingCheck(entry));
	const unaccountedCount = Math.max(0, pr.checks.pending - pendingEntries.length);
	return {
		expectedEntries,
		ordinaryEntries,
		expectedCount: expectedEntries.length,
		ordinaryCount: ordinaryEntries.length + unaccountedCount,
		unaccountedOrdinaryCount: unaccountedCount,
	};
}

export function checkPresentationColor(
	presentation: StackCheckPresentation | null,
): StackThemeColor {
	if (presentation === null || presentation === "expected-pending") return "muted";
	return CHECK_BUCKET_DISPLAY[presentation].color;
}

export function checkPresentationForPr(pr: StackViewPr): StackCheckPresentation | null {
	if (pr.checks.total <= 0) return null;
	if (pr.checks.failing > 0) return "failing";
	const pending = partitionPendingChecks(pr);
	if (pending.ordinaryCount > 0) return "pending";
	if (pending.expectedCount > 0) return "expected-pending";
	if (pr.checks.cancelled > 0) return "cancelled";
	return "passing";
}

export function entriesForCheckBucket(
	entries: readonly StackViewCheckEntry[],
	bucket: StackViewCheckBucket,
): StackViewCheckEntry[] {
	return entries.filter((entry) => entry.bucket === bucket);
}

export function formatCheckEntryLabel(
	entry: Pick<StackViewCheckEntry, "name" | "workflowName">,
): string {
	return entry.workflowName === null ? entry.name : `${entry.name} (${entry.workflowName})`;
}

export function formatThreadDetailLabel(
	thread: Pick<StackViewThreadDetail, "path" | "line" | "author">,
): string {
	const location = thread.path.length > 0 ? thread.path : "(file unknown)";
	const withLine = thread.line !== null ? `${location}:${thread.line}` : location;
	return thread.author !== null ? `${withLine} · ${thread.author}` : withLine;
}

export function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
