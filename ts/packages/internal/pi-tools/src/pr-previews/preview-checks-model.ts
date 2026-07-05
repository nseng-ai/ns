import { stripTerminalEscapes } from "@nseng-ai/pi/terminal/presentation";

export type PrPreviewCheckBucket = "failing" | "pending" | "unknown" | "passing";
export type PrPreviewCheckKind = "check_run" | "status_context" | "unknown";

export const PREVIEW_CHECK_BUCKET_ORDER = [
	"failing",
	"pending",
	"unknown",
	"passing",
] as const satisfies readonly PrPreviewCheckBucket[];

export interface PrPreviewChecksTarget {
	pr_number: number | null;
	title: string | null;
	url: string | null;
	branch: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	head_ref_oid: string | null;
}

export function effectiveBranch(target: PrPreviewChecksTarget): string | null {
	return target.head_ref_name ?? target.branch;
}

export interface PrPreviewChecksCounts {
	passing: number;
	pending: number;
	failing: number;
	unknown: number;
	hasMore?: boolean;
}

export interface PrPreviewCheck {
	bucket: PrPreviewCheckBucket;
	kind: PrPreviewCheckKind;
	name: string;
	workflow_name: string | null;
	status: string | null;
	conclusion: string | null;
	state: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string | null;
	details_url: string | null;
	target_url: string | null;
	identity: string | null;
}

export interface PrPreviewChecksStackEntry {
	target: PrPreviewChecksTarget;
	counts: PrPreviewChecksCounts;
	checks: readonly PrPreviewCheck[];
}

export interface PrPreviewChecksViewModel {
	target: PrPreviewChecksTarget;
	counts: PrPreviewChecksCounts;
	fetchedAt: Date;
	checks: readonly PrPreviewCheck[];
	stack?: readonly PrPreviewChecksStackEntry[];
}

export interface PrPreviewChecksDetailRow {
	role: "finding" | "review" | "body" | "evidence" | "source" | "comment" | "spacer";
	text: string;
	bucket?: PrPreviewCheckBucket;
}

export type PrPreviewStatusColor = "error" | "warning" | "muted" | "dim";

export interface PrPreviewBucketPresentation {
	icon: string;
	color: PrPreviewStatusColor;
	bold: boolean;
}

export const BUCKET_PRESENTATION = {
	failing: { icon: "✗", color: "error", bold: true },
	pending: { icon: "⏳", color: "warning", bold: false },
	unknown: { icon: "?", color: "muted", bold: false },
	passing: { icon: "✓", color: "dim", bold: false },
} satisfies Record<PrPreviewCheckBucket, PrPreviewBucketPresentation>;

export function bucketPresentation(bucket: PrPreviewCheckBucket): PrPreviewBucketPresentation {
	return BUCKET_PRESENTATION[bucket];
}

export function sortPreviewChecks(checks: readonly PrPreviewCheck[]): PrPreviewCheck[] {
	return [...checks].sort((left, right) => {
		const bucketDelta =
			PREVIEW_CHECK_BUCKET_ORDER.indexOf(left.bucket) -
			PREVIEW_CHECK_BUCKET_ORDER.indexOf(right.bucket);
		if (bucketDelta !== 0) return bucketDelta;
		return `${left.workflow_name ?? ""}\u0000${left.name}`.localeCompare(
			`${right.workflow_name ?? ""}\u0000${right.name}`,
		);
	});
}

export function previewChecksStackEntries(
	model: PrPreviewChecksViewModel,
): readonly PrPreviewChecksStackEntry[] {
	if (model.stack !== undefined && model.stack.length > 0) return model.stack;
	return [{ target: model.target, counts: model.counts, checks: model.checks }];
}

export function buildStackEntryRowLabel(entry: PrPreviewChecksStackEntry): string {
	const branch = effectiveBranch(entry.target);
	const route = branch === null ? null : `${branch} → ${entry.target.base_ref_name ?? "?"}`;
	return [
		`PR #${entry.target.pr_number ?? "?"}`,
		compactCountsSummary(entry.counts),
		entry.target.title ?? branch ?? "(unmapped branch)",
		route,
	]
		.filter((part): part is string => part !== null)
		.join(" · ");
}

export function compactCountsSummary(counts: PrPreviewChecksCounts): string {
	const badges = PREVIEW_CHECK_BUCKET_ORDER.filter((bucket) => counts[bucket] > 0).map(
		(bucket) => `${BUCKET_PRESENTATION[bucket].icon}${counts[bucket]}`,
	);
	if (badges.length === 0) return "no checks";
	return `${badges.join(" ")}${counts.hasMore === true ? "+" : ""}`;
}

export function countsSummary(counts: PrPreviewChecksCounts): string {
	const buckets = PREVIEW_CHECK_BUCKET_ORDER.map((bucket) => `${counts[bucket]} ${bucket}`);
	return `${buckets.join(" / ")}${counts.hasMore === true ? " · more not shown" : ""}`;
}

export function buildCheckRowLabel(check: PrPreviewCheck): string {
	const title = stripTerminalEscapes(check.name);
	return [
		bucketIcon(check.bucket),
		check.bucket,
		check.workflow_name,
		title,
		check.conclusion ?? check.status ?? check.state,
	]
		.filter((part): part is string => part !== null)
		.join(" · ");
}

export function aggregatePreviewChecksCounts(
	entries: readonly PrPreviewChecksStackEntry[],
): PrPreviewChecksCounts {
	return entries.reduce<PrPreviewChecksCounts>(
		(counts, entry) => ({
			passing: counts.passing + entry.counts.passing,
			pending: counts.pending + entry.counts.pending,
			failing: counts.failing + entry.counts.failing,
			unknown: counts.unknown + entry.counts.unknown,
			...(counts.hasMore === true || entry.counts.hasMore === true ? { hasMore: true } : {}),
		}),
		{ passing: 0, pending: 0, failing: 0, unknown: 0 },
	);
}

export function buildCheckDetailRows(
	check: PrPreviewCheck | undefined,
): PrPreviewChecksDetailRow[] {
	if (check === undefined) return [{ role: "body", text: "No check selected." }];
	return [
		{ role: "finding", text: check.name },
		{ role: "review", text: `Bucket: ${check.bucket} · Kind: ${check.kind}`, bucket: check.bucket },
		{ role: "spacer", text: "" },
		...fieldRows([
			["Workflow", check.workflow_name],
			["Status", check.status],
			["Conclusion", check.conclusion],
			["State", check.state],
			["Started", check.started_at],
			["Completed", check.completed_at],
			["Created", check.created_at],
			["Details URL", check.details_url],
			["Target URL", check.target_url],
			["Identity", check.identity],
		]),
	];
}

function fieldRows(
	fields: readonly (readonly [string, string | null])[],
): PrPreviewChecksDetailRow[] {
	return fields.flatMap(([label, value]) =>
		value === null ? [] : [{ role: "body" as const, text: `${label}: ${value}` }],
	);
}

function bucketIcon(bucket: PrPreviewCheckBucket): string {
	return bucketPresentation(bucket).icon;
}
