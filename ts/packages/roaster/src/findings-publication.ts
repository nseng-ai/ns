import {
	buildFailureMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	machineEnvelopeSchema,
} from "@asdl/clinkr";
import { formatZodError, truncatedSha256Digest } from "@asdl/core/primitives";
import { z } from "zod";

import type { RoasterContext } from "./context.ts";
import { classifyInlineFindings } from "./inline-commentability.ts";
import {
	reviewRunResultSchema,
	type InlinePostingStatus,
	type PRInlineCommentInput,
	type PostInlineFindingsResult,
	type ReviewFinding,
	type ReviewInputCoverage,
} from "./models.ts";

const SUMMARY_MARKER_RE = /^<!-- (roaster:[^ ]+) -->$/;
const INLINE_MARKER_PREFIX = "roaster-inline";
const ACTIVITY_LOG_HEADING = "### Activity Log";
const ACTIVITY_LOG_CAP = 10;
const OMITTED_INPUT_FILES_RENDER_LIMIT = 10;
const FOOTER = "_Posted by roaster. This comment is informational and does not block the check._";
const BOT_LOGIN = "github-actions[bot]";

const reviewRunSuccessEnvelopeSchema = buildSuccessMachineEnvelopeSchema(reviewRunResultSchema);

const reviewRunFailureEnvelopeSchema = buildFailureMachineEnvelopeSchema({
	errorTypeSchema: z.string().trim().min(1),
});

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

export interface FindingsPayloadParseError {
	readonly type: "findings_payload_parse_error";
	readonly message: string;
}

export interface FindingsCommentBodyParseError {
	readonly type: "findings_comment_body_parse_error";
	readonly message: string;
}

export interface ParsedFindingsCommentBody {
	readonly marker: string;
	readonly body: string;
}

export type FindingsPayloadParseResult =
	| { readonly type: "ok"; readonly payload: FindingsPayload }
	| { readonly type: "error"; readonly error: FindingsPayloadParseError };
export type FindingsCommentBodyParseResult =
	| { readonly type: "ok"; readonly parsed: ParsedFindingsCommentBody }
	| { readonly type: "error"; readonly error: FindingsCommentBodyParseError };

export function parseFindingsPayloadResult(
	raw: string,
	options: { readonly fallbackReviewName?: string; readonly fallbackBaseRef?: string } = {},
): FindingsPayloadParseResult {
	const fallbackReviewName = options.fallbackReviewName ?? "unknown";
	const fallbackBaseRef = options.fallbackBaseRef ?? "unknown";
	const data = parseJson(raw);
	if (data.type === "error") return payloadError(data.message);
	if (!machineEnvelopeSchema.safeParse(data.value).success)
		return payloadError("expected a clinkr envelope with top-level 'exit_code'");

	const success = reviewRunSuccessEnvelopeSchema.safeParse(data.value);
	if (success.success) {
		return {
			type: "ok",
			payload: {
				reviewName: success.data.data.reviewName,
				baseRef: success.data.data.baseRef,
				count: success.data.data.count,
				findings: success.data.data.findings,
				inputCoverage: success.data.data.inputCoverage,
				errorType: null,
				errorMessage: null,
			},
		};
	}

	const failure = reviewRunFailureEnvelopeSchema.safeParse(data.value);
	if (failure.success) {
		return {
			type: "ok",
			payload: {
				reviewName: fallbackReviewName,
				baseRef: fallbackBaseRef,
				count: 0,
				findings: [],
				inputCoverage: null,
				errorType: failure.data.error_type,
				errorMessage: failure.data.message,
			},
		};
	}

	return payloadError(`invalid review-run envelope: ${formatZodError(success.error)}`);
}

export interface PublishFindingsOptions {
	readonly prNumber: number;
	readonly envelope: string;
	readonly runUrl?: string | undefined;
	readonly fallbackReviewName?: string | undefined;
	readonly fallbackBaseRef?: string | undefined;
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export type PublishFindingsResult =
	| {
			readonly type: "ok";
			readonly inlineStatus: PostInlineFindingsResult;
			readonly summaryAction: "posted" | "updated";
	  }
	| { readonly type: "error"; readonly message: string };

export async function publishFindings(
	ctx: Pick<RoasterContext, "github">,
	options: PublishFindingsOptions,
): Promise<PublishFindingsResult> {
	const parsed = parseFindingsPayloadResult(options.envelope, fallbackPayloadOptions(options));
	if (parsed.type === "error") return publicationError(parsed.error.message);

	const inlineStatus = await postInlineFindings(ctx, parsed.payload, options);
	const renderedBody = renderFindingsComment(parsed.payload, { inlineStatus });
	const parsedBody = parseFindingsCommentBody(renderedBody);
	if (parsedBody.type === "error") return publicationError(parsedBody.error.message);

	const existing = await ctx.github.findPrDiscussionCommentByMarker({
		prNumber: options.prNumber,
		marker: parsedBody.parsed.marker,
		authorLogin: BOT_LOGIN,
		...githubOptions(options),
	});
	if (existing.type === "error") return publicationError(existing.error.message);

	const nextBody = preserveActivityLog(
		existing.value?.body ?? "",
		parsedBody.parsed.body,
		activityLogEntry(options.runUrl),
	);
	const written =
		existing.value === null
			? await ctx.github.addPrDiscussionComment(options.prNumber, nextBody, githubOptions(options))
			: await ctx.github.updatePrDiscussionComment(
					existing.value.id,
					nextBody,
					githubOptions(options),
				);
	if (written.type === "error") return publicationError(written.error.message);

	return {
		type: "ok",
		inlineStatus,
		summaryAction: existing.value === null ? "posted" : "updated",
	};
}

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

async function postInlineFindings(
	ctx: Pick<RoasterContext, "github">,
	payload: FindingsPayload,
	options: PublishFindingsOptions,
): Promise<PostInlineFindingsResult> {
	if (payload.errorType !== null || payload.count === 0) return emptyInlineResult();

	let changedFilesResult: Awaited<ReturnType<RoasterContext["github"]["getPrChangedFiles"]>>;
	try {
		changedFilesResult = await ctx.github.getPrChangedFiles(
			options.prNumber,
			githubOptions(options),
		);
	} catch (caught) {
		return { ...emptyInlineResult(), apiError: caughtMessage(caught) };
	}
	if (changedFilesResult.type === "error") {
		return { ...emptyInlineResult(), apiError: changedFilesResult.error.message };
	}

	let reviewCommentsResult: Awaited<ReturnType<RoasterContext["github"]["getPrReviewComments"]>>;
	try {
		reviewCommentsResult = await ctx.github.getPrReviewComments(
			options.prNumber,
			githubOptions(options),
		);
	} catch (caught) {
		return { ...emptyInlineResult(), apiError: caughtMessage(caught) };
	}
	if (reviewCommentsResult.type === "error") {
		return { ...emptyInlineResult(), apiError: reviewCommentsResult.error.message };
	}

	const classified = classifyInlineFindings(payload.findings, changedFilesResult.value);
	const existingMarkers = new Set(
		reviewCommentsResult.value
			.filter((comment) => comment.author === BOT_LOGIN)
			.flatMap((comment) => extractInlineMarkers(comment.body)),
	);
	const comments: PRInlineCommentInput[] = [];
	let skippedDuplicateCount = 0;

	for (const item of classified.inlineable) {
		const marker = inlineMarkerForFinding(payload.reviewName, item.finding);
		if (existingMarkers.has(marker)) {
			skippedDuplicateCount += 1;
			continue;
		}
		comments.push({
			path: item.target.path,
			line: item.target.line,
			body: renderInlineBody(marker, item.finding, { reviewName: payload.reviewName }),
		});
	}

	let apiError: string | null = null;
	let postedCount = 0;
	if (comments.length > 0) {
		try {
			const posted = await ctx.github.createPrReview(
				options.prNumber,
				comments,
				githubOptions(options),
			);
			if (posted.type === "error") apiError = posted.error.message;
			else postedCount = comments.length;
		} catch (caught) {
			apiError = caughtMessage(caught);
		}
	}

	return {
		postedCount,
		skippedDuplicateCount,
		fallbackOnlyCount: classified.fallbackOnly.length,
		apiError,
		fallbackOnly: classified.fallbackOnly,
	};
}

function emptyInlineResult(): PostInlineFindingsResult {
	return {
		postedCount: 0,
		skippedDuplicateCount: 0,
		fallbackOnlyCount: 0,
		apiError: null,
		fallbackOnly: [],
	};
}

function fallbackPayloadOptions(
	options: Pick<PublishFindingsOptions, "fallbackReviewName" | "fallbackBaseRef">,
): {
	readonly fallbackReviewName?: string;
	readonly fallbackBaseRef?: string;
} {
	return {
		...(options.fallbackReviewName === undefined
			? {}
			: { fallbackReviewName: options.fallbackReviewName }),
		...(options.fallbackBaseRef === undefined ? {} : { fallbackBaseRef: options.fallbackBaseRef }),
	};
}

function githubOptions(options: Pick<PublishFindingsOptions, "cwd" | "env" | "signal">): {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
} {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function activityLogEntry(runUrl: string | undefined): string {
	const timestamp = new Date().toISOString();
	return runUrl === undefined || runUrl.trim() === "" ? timestamp : `${timestamp} · ${runUrl}`;
}

function caughtMessage(caught: unknown): string {
	return caught instanceof Error ? caught.message : String(caught);
}

function publicationError(message: string): PublishFindingsResult {
	return { type: "error", message };
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

type JsonResult =
	| { readonly type: "ok"; readonly value: unknown }
	| { readonly type: "error"; readonly message: string };

function parseJson(raw: string): JsonResult {
	try {
		return { type: "ok", value: JSON.parse(raw) };
	} catch (caught) {
		return {
			type: "error",
			message: `input is not valid JSON: ${caught instanceof Error ? caught.message : String(caught)}`,
		};
	}
}

function payloadError(message: string): FindingsPayloadParseResult {
	return { type: "error", error: { type: "findings_payload_parse_error", message } };
}

function commentBodyError(message: string): FindingsCommentBodyParseResult {
	return { type: "error", error: { type: "findings_comment_body_parse_error", message } };
}
