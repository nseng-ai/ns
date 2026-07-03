import { stripTerminalEscapes } from "@ns/pi/terminal/presentation";

export type PrPreviewCheckBucket = "failing" | "pending" | "unknown" | "passing";
export type PrPreviewCheckKind = "check_run" | "status_context" | "unknown";

export interface PrPreviewChecksTarget {
	pr_number: number;
	title: string | null;
	url: string | null;
	branch: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	head_ref_oid: string | null;
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

export interface PrPreviewChecksViewModel {
	target: PrPreviewChecksTarget;
	counts: PrPreviewChecksCounts;
	fetchedAt: Date;
	checks: readonly PrPreviewCheck[];
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
	const order: Record<PrPreviewCheckBucket, number> = {
		failing: 0,
		pending: 1,
		unknown: 2,
		passing: 3,
	};
	return [...checks].sort((left, right) => {
		const bucketDelta = order[left.bucket] - order[right.bucket];
		if (bucketDelta !== 0) return bucketDelta;
		return `${left.workflow_name ?? ""}\u0000${left.name}`.localeCompare(
			`${right.workflow_name ?? ""}\u0000${right.name}`,
		);
	});
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
