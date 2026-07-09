import type {
	StackViewCheckBucket,
	StackViewCheckEntry,
	StackViewPr,
	StackViewPrChecks,
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
	ready: { word: "ready", color: "success" },
	"no-pr": { word: "no-pr", color: "dim" },
};

export const CHECK_BUCKET_DISPLAY: Record<
	StackViewCheckBucket,
	{
		glyph: string;
		role: "check-failing" | "check-pending" | "check-passing";
		color: StackThemeColor;
	}
> = {
	failing: { glyph: "✗", role: "check-failing", color: "error" },
	pending: { glyph: "⋯", role: "check-pending", color: "warning" },
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

export function checkBucketColor(bucket: StackViewCheckBucket | null): StackThemeColor {
	return bucket === null ? "muted" : CHECK_BUCKET_DISPLAY[bucket].color;
}

export function checkBucketForCounts(checks: StackViewPrChecks): StackViewCheckBucket | null {
	if (checks.total <= 0) return null;
	if (checks.failing > 0) return "failing";
	if (checks.pending > 0) return "pending";
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
