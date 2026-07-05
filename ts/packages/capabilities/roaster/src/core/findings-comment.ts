import { truncatedSha256Digest } from "@ns/core/primitives";
import { z } from "zod";

import { formatOmittedReviewInputFile } from "./input-coverage-formatting.ts";
import {
	type InlinePostingStatus,
	type LastReviewedHeadState,
	lastReviewedHeadStateSchema,
	reviewFindingSchema,
	type ReviewFinding,
	type ReviewInputCoverage,
} from "./models.ts";
import { roasterReviewDisplayRole } from "./review-display.ts";

const SUMMARY_MARKER_RE = /^<!-- (roaster:[^ ]+) -->$/;
const INLINE_MARKER_PREFIX = "roaster-inline";
const MACHINE_STATE_START = "<!-- roaster-state:v1";
const MACHINE_STATE_END = "-->";
const MACHINE_STATE_LINE_WIDTH = 100;
// Keep the newest exact-finding records when long-running PRs exceed the durable comment budget.
export const PRIOR_FINDINGS_STATE_CAP = 50;
const ACTIVITY_LOG_HEADING = "### Activity Log";
const ACTIVITY_LOG_CAP = 10;
const OMITTED_INPUT_FILES_RENDER_LIMIT = 10;
const FOOTER = "_Posted by roaster. This comment is informational and does not block the check._";

const SEVERITY_LABELS = {
	error: "⛔ error",
	warning: "⚠️ warning",
	info: "ℹ️ info",
} as const;

export interface FindingsPayload {
	readonly reviewName: string;
	readonly baseRef: string;
	readonly modelProfile: string | null;
	readonly count: number;
	readonly findings: readonly ReviewFinding[];
	readonly inputCoverage: ReviewInputCoverage | null;
	readonly errorType: string | null;
	readonly errorMessage: string | null;
}

export type { LastReviewedHeadState } from "./models.ts";

export interface PriorFindingRecord {
	readonly id: string;
	readonly finding: ReviewFinding;
	readonly firstSeenHeadSha: string | null;
	readonly lastSeenHeadSha: string | null;
}

export interface PriorFindingsState {
	readonly cap: number;
	readonly prunedCount: number;
	readonly findings: readonly PriorFindingRecord[];
}

export interface FindingsCommentMachineState {
	readonly version: 1;
	readonly lastReviewedHead: LastReviewedHeadState | null;
	readonly priorFindings: PriorFindingsState;
}

export interface FindingsCommentMachineStateOptions {
	readonly existingBody?: string;
	readonly payload: FindingsPayload;
	readonly lastReviewedHead?: LastReviewedHeadState | null;
	readonly cap?: number;
}

const priorFindingRecordSchema = z
	.object({
		id: z.string().trim().min(1),
		finding: reviewFindingSchema,
		firstSeenHeadSha: z.string().trim().min(1).nullable(),
		lastSeenHeadSha: z.string().trim().min(1).nullable(),
	})
	.strict();

const findingsCommentMachineStateSchema = z
	.object({
		version: z.literal(1),
		lastReviewedHead: lastReviewedHeadStateSchema.nullable(),
		priorFindings: z
			.object({
				cap: z.int().positive(),
				prunedCount: z.int().min(0),
				findings: z.array(priorFindingRecordSchema),
			})
			.strict(),
	})
	.strict();

export interface FindingsCommentBodyParseError {
	readonly type: "findings_comment_body_parse_error";
	readonly message: string;
}

export interface ParsedFindingsCommentBody {
	readonly marker: string;
	readonly body: string;
}

export type FindingsCommentBodyParseResult =
	| { readonly type: "ok"; readonly parsed: ParsedFindingsCommentBody }
	| { readonly type: "error"; readonly error: FindingsCommentBodyParseError };

export function renderFindingsComment(
	payload: FindingsPayload,
	options: {
		readonly inlineStatus?: InlinePostingStatus | null;
		readonly machineState?: FindingsCommentMachineState | null;
	} = {},
): string {
	const lines = [summaryMarkerForReview(payload.reviewName)];
	if (options.machineState !== undefined && options.machineState !== null) {
		lines.push(...renderFindingsCommentMachineState(options.machineState));
	}
	lines.push(renderFindingsCommentHeading(payload), "");
	if (options.inlineStatus !== undefined && options.inlineStatus !== null) {
		lines.push(...renderInlinePostingStatus(options.inlineStatus), "");
	}
	if (payload.errorType !== null) {
		lines.push(...renderErrorBody(payload));
	} else {
		if (payload.inputCoverage !== null)
			lines.push(...renderInputCoverage(payload.inputCoverage), "");
		lines.push(
			...(payload.count === 0 ? renderNoFindingsBody(payload) : renderFindingsBody(payload)),
		);
	}
	return lines.join("\n");
}

export function summaryMarkerForReview(reviewName: string): string {
	return `<!-- roaster:${reviewName} -->`;
}

export function parseFindingsCommentBody(raw: string): FindingsCommentBodyParseResult {
	const firstLine = raw.split(/\r?\n/u)[0];
	if (firstLine === undefined || firstLine === "") return commentBodyError("input body is empty");
	const match = SUMMARY_MARKER_RE.exec(firstLine.trimEnd());
	if (match === null)
		return commentBodyError("first line of body must be a `<!-- roaster:<key> -->` marker");
	return { type: "ok", parsed: { marker: `<!-- ${match[1]} -->`, body: raw } };
}

export function buildFindingsCommentMachineState(
	options: FindingsCommentMachineStateOptions,
): FindingsCommentMachineState {
	const cap = options.cap ?? PRIOR_FINDINGS_STATE_CAP;
	const existingState =
		options.existingBody === undefined
			? null
			: parseFindingsCommentMachineState(options.existingBody);
	const currentHeadSha = options.lastReviewedHead?.headSha ?? null;
	const findings = mergePriorFindingRecords({
		reviewName: options.payload.reviewName,
		existing: existingState?.priorFindings.findings ?? [],
		current: options.payload.findings,
		currentHeadSha,
		cap,
	});
	return {
		version: 1,
		lastReviewedHead: options.lastReviewedHead ?? existingState?.lastReviewedHead ?? null,
		priorFindings: {
			cap,
			prunedCount: (existingState?.priorFindings.prunedCount ?? 0) + findings.prunedCount,
			findings: findings.records,
		},
	};
}

export function parseFindingsCommentMachineState(raw: string): FindingsCommentMachineState | null {
	const lines = raw.split(/\r?\n/u);
	const startIndex = lines.findIndex((line) => line.trim() === MACHINE_STATE_START);
	if (startIndex === -1) return null;
	const endIndex = lines.findIndex(
		(line, index) => index > startIndex && line.trim() === MACHINE_STATE_END,
	);
	if (endIndex === -1) return null;
	const encoded = lines
		.slice(startIndex + 1, endIndex)
		.map((line) => line.trim())
		.join("");
	if (encoded === "") return null;
	const decoded = decodeBase64Url(encoded);
	if (decoded === null) return null;
	const data = parseJson(decoded);
	if (data === null) return null;
	const parsed = findingsCommentMachineStateSchema.safeParse(data);
	return parsed.success ? parsed.data : null;
}

export function inlineMarkerForFinding(reviewName: string, finding: ReviewFinding): string {
	const digest = findingDigest({ reviewName, finding, length: 16 });
	return `<!-- ${INLINE_MARKER_PREFIX}:${reviewName}:${digest} -->`;
}

export function extractInlineMarkers(body: string): readonly string[] {
	return body
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.startsWith(`<!-- ${INLINE_MARKER_PREFIX}:`) && line.endsWith(" -->"));
}

export function renderInlineBody(
	marker: string,
	finding: ReviewFinding,
	options: { readonly reviewName: string; readonly modelProfile?: string | null },
): string {
	return [
		marker,
		`**${finding.severity}: ${finding.summary}**`,
		`_${inlineReviewLabel(options.modelProfile)}: \`${options.reviewName}\`._`,
		"",
		finding.details,
		"",
		"_Posted by roaster. Re-running may skip this comment by marker._",
	].join("\n");
}

export function preserveActivityLog(
	existingBody: string,
	newBody: string,
	runSummary: string,
): string {
	const entries = [...extractActivityLogEntries(existingBody), runSummary].slice(-ACTIVITY_LOG_CAP);
	return (
		[
			stripActivityLog(newBody).trimEnd(),
			"",
			ACTIVITY_LOG_HEADING,
			"",
			...entries.map((entry) => `- ${entry}`),
		].join("\n") + "\n"
	);
}

function renderFindingsCommentMachineState(state: FindingsCommentMachineState): string[] {
	const encoded = encodeBase64Url(JSON.stringify(state));
	return [
		MACHINE_STATE_START,
		...chunkString(encoded, MACHINE_STATE_LINE_WIDTH),
		MACHINE_STATE_END,
	];
}

function mergePriorFindingRecords(options: {
	readonly reviewName: string;
	readonly existing: readonly PriorFindingRecord[];
	readonly current: readonly ReviewFinding[];
	readonly currentHeadSha: string | null;
	readonly cap: number;
}): { readonly records: readonly PriorFindingRecord[]; readonly prunedCount: number } {
	const recordsById = new Map<string, PriorFindingRecord>();
	for (const record of options.existing) recordsById.set(record.id, record);
	for (const finding of options.current) {
		const id = priorFindingId(options.reviewName, finding);
		const existing = recordsById.get(id);
		// Refresh insertion order so cap pruning keeps re-confirmed findings over stale ones.
		if (existing !== undefined) recordsById.delete(id);
		recordsById.set(id, {
			id,
			finding,
			firstSeenHeadSha: existing?.firstSeenHeadSha ?? options.currentHeadSha,
			lastSeenHeadSha: options.currentHeadSha,
		});
	}
	const { kept, omittedCount } = capTrailingRecords([...recordsById.values()], options.cap);
	return { records: kept, prunedCount: omittedCount };
}

export function capTrailingRecords<T>(
	records: readonly T[],
	cap: number,
): { readonly kept: readonly T[]; readonly omittedCount: number } {
	const omittedCount = Math.max(0, records.length - cap);
	return { kept: records.slice(-cap), omittedCount };
}

function priorFindingId(reviewName: string, finding: ReviewFinding): string {
	return findingDigest({
		prefix: "prior-finding-v1",
		reviewName,
		finding,
		length: 32,
	});
}

function findingDigest(options: {
	readonly prefix?: string;
	readonly reviewName: string;
	readonly finding: ReviewFinding;
	readonly length: number;
}): string {
	const input =
		options.prefix === undefined
			? findingDigestInput(options.reviewName, options.finding)
			: findingDigestInput(options.reviewName, options.finding, { prefix: options.prefix });
	return truncatedSha256Digest(input).slice(0, options.length);
}

function findingDigestInput(
	reviewName: string,
	finding: ReviewFinding,
	options: { readonly prefix?: string } = {},
): string {
	return [
		...(options.prefix === undefined ? [] : [options.prefix]),
		reviewName,
		finding.path ?? "",
		finding.line === null ? "" : String(finding.line),
		finding.severity,
		finding.summary,
		finding.details,
	].join("\0");
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string | null {
	try {
		return Buffer.from(value, "base64url").toString("utf8");
	} catch {
		// Malformed legacy/comment state should not block publishing a fresh summary.
		return null;
	}
}

function chunkString(value: string, width: number): readonly string[] {
	const chunks: string[] = [];
	for (let index = 0; index < value.length; index += width) {
		chunks.push(value.slice(index, index + width));
	}
	return chunks;
}

function parseJson(raw: string): unknown | null {
	try {
		return JSON.parse(raw);
	} catch {
		// Malformed legacy/comment state should not block publishing a fresh summary.
		return null;
	}
}

function renderFindingsCommentHeading(payload: FindingsPayload): string {
	if (
		payload.modelProfile !== null &&
		roasterReviewDisplayRole(payload.modelProfile) === "tripwire"
	) {
		return `## roaster tripwire · \`${payload.reviewName}\``;
	}
	return `## roaster · \`${payload.reviewName}\``;
}

function inlineReviewLabel(modelProfile: string | null | undefined): "Tripwire" | "Review" {
	if (modelProfile !== null && modelProfile !== undefined) {
		return roasterReviewDisplayRole(modelProfile) === "tripwire" ? "Tripwire" : "Review";
	}
	return "Review";
}

function renderInlinePostingStatus(status: InlinePostingStatus): string[] {
	const lines = [
		"### Inline posting",
		"",
		`- **Inline comments posted:** ${status.postedCount}`,
		`- **Duplicate inline comments skipped:** ${status.skippedDuplicateCount}`,
		`- **Summary-only findings:** ${status.fallbackOnlyCount}`,
	];
	if (status.apiError !== null) lines.push(`- **API error:** ${status.apiError}`);
	return lines;
}

function renderErrorBody(payload: FindingsPayload): string[] {
	return [
		`**Roaster failed** against base \`${payload.baseRef}\`. ⚠️`,
		"",
		`- **Error type:** \`${payload.errorType ?? "unknown"}\``,
		`- **Message:** ${payload.errorMessage ?? "(none)"}`,
	];
}

function renderInputCoverage(coverage: ReviewInputCoverage): string[] {
	const lines = [
		"### Review input coverage",
		"",
		`- **Filtered diff files:** ${coverage.changedPathCount} (${coverage.includedFileCount} supplied to bounded prompt input, ${coverage.omittedFileCount} omitted)`,
		`- **Filtered diff estimate:** ~${coverage.fullDiffEstimatedTokens} tokens`,
		`- **Prompt caps:** ${coverage.promptDiffTokenCap} diff tokens total; ${coverage.promptDiffFileTokenCap} tokens per file diff`,
	];
	if (coverage.omittedFileCount === 0)
		return [
			...lines,
			"",
			"Bounded prompt input included all files in the filtered diff after configured roaster exclusions.",
		];
	lines.push(
		"",
		"Review completed with bounded prompt input. The following filtered-diff file segments were not supplied in prompt input after configured roaster exclusions:",
	);
	for (const file of coverage.omittedFiles.slice(0, OMITTED_INPUT_FILES_RENDER_LIMIT)) {
		lines.push(`- \`${file.path}\` (${formatOmittedReviewInputFile(file)})`);
	}
	const remaining =
		coverage.omittedFileCount -
		Math.min(coverage.omittedFiles.length, OMITTED_INPUT_FILES_RENDER_LIMIT);
	if (remaining > 0) lines.push(`- …and ${remaining} more omitted file diff(s).`);
	return lines;
}

function renderNoFindingsBody(payload: FindingsPayload): string[] {
	if (payload.inputCoverage !== null && payload.inputCoverage.omittedFileCount > 0)
		return [
			`**No findings in the reviewed bounded input** against base \`${payload.baseRef}\`. ✅`,
		];
	return [`**No findings** against base \`${payload.baseRef}\`. ✅`];
}

function renderFindingsBody(payload: FindingsPayload): string[] {
	const noun = payload.count === 1 ? "finding" : "findings";
	const lines = [
		`**${payload.count} ${noun}** against base \`${payload.baseRef}\`.`,
		"",
		"| Severity | File | Line | Summary |",
		"| --- | --- | --- | --- |",
	];
	lines.push(...payload.findings.map(findingTableRow));
	lines.push("", "<details>", "<summary>Details</summary>", "");
	for (const finding of payload.findings) {
		lines.push(
			`### \`${findingLocation(finding)}\` — ${finding.severity}`,
			`**${finding.summary}**`,
			"",
			finding.details,
			"",
		);
	}
	lines.push("</details>", "", FOOTER);
	return lines;
}

function findingTableRow(finding: ReviewFinding): string {
	return `| ${SEVERITY_LABELS[finding.severity]} | \`${finding.path ?? "—"}\` | ${lineDisplay(finding.line)} | ${finding.summary} |`;
}

export function findingLocation(finding: ReviewFinding): string {
	const path = finding.path ?? "unknown path";
	return finding.line === null ? path : `${path}:${finding.line}`;
}

function lineDisplay(line: number | null): string {
	return line === null ? "—" : String(line);
}

function extractActivityLogEntries(body: string): readonly string[] {
	const lines = body.split(/\r?\n/u);
	const headingIndex = lines.findIndex((line) => line.trim() === ACTIVITY_LOG_HEADING);
	if (headingIndex === -1) return [];
	return lines
		.slice(headingIndex + 1)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2));
}

function stripActivityLog(body: string): string {
	const lines = body.split(/\r?\n/u);
	const headingIndex = lines.findIndex((line) => line.trim() === ACTIVITY_LOG_HEADING);
	return headingIndex === -1 ? body : lines.slice(0, headingIndex).join("\n");
}

function commentBodyError(message: string): FindingsCommentBodyParseResult {
	return { type: "error", error: { type: "findings_comment_body_parse_error", message } };
}
