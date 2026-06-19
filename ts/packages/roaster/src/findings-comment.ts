import { truncatedSha256Digest } from "@asdl/core/primitives";

import {
	type InlinePostingStatus,
	type ReviewFinding,
	type ReviewInputCoverage,
} from "./models.ts";

const SUMMARY_MARKER_RE = /^<!-- (roaster:[^ ]+) -->$/;
const INLINE_MARKER_PREFIX = "roaster-inline";
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
	readonly count: number;
	readonly findings: readonly ReviewFinding[];
	readonly inputCoverage: ReviewInputCoverage | null;
	readonly errorType: string | null;
	readonly errorMessage: string | null;
}

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
	options: { readonly inlineStatus?: InlinePostingStatus | null | undefined } = {},
): string {
	const lines = [
		summaryMarkerForReview(payload.reviewName),
		`## roaster · \`${payload.reviewName}\``,
		"",
	];
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

export function inlineMarkerForFinding(reviewName: string, finding: ReviewFinding): string {
	const digestInput = [
		reviewName,
		finding.path ?? "",
		finding.line === null ? "" : String(finding.line),
		finding.severity,
		finding.summary,
		finding.details,
	].join("\0");
	const digest = truncatedSha256Digest(digestInput).slice(0, 16);
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
	options: { readonly reviewName: string },
): string {
	return [
		marker,
		`**${finding.severity}: ${finding.summary}**`,
		`_Review: \`${options.reviewName}\`._`,
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
		lines.push(
			`- \`${file.path}\` (${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("_", " ")})`,
		);
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

function findingLocation(finding: ReviewFinding): string {
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
