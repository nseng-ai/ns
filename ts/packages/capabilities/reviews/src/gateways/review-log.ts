import {
	listBrmemEntries,
	putBrmemEntryFromFile,
	type BrmemCommandErrorInfo,
} from "@nseng-ai/capability-kit/brmem-cli";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { resultErr } from "@nseng-ai/foundation/result";
import { withTemporaryFile } from "@nseng-ai/capability-kit/temp-files";

import type { RoasterEnvironmentOptions } from "../core/context.ts";
import type { ReviewLogFailure, ReviewLogFailureCode, ReviewResult } from "../core/failures.ts";
import type { ReviewInputCoverage, ReviewRunResult, ReviewUsage } from "../core/models.ts";
import { roasterReviewDisplayRole } from "../core/review-display.ts";

export const ROASTER_REVIEW_LOG_NAMESPACE = "roaster";
const REVIEW_LOG_PREFIX = "reviews";
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.md$/u;

export interface ReviewLogWriteRequest extends RoasterEnvironmentOptions {
	readonly reviewKey: string;
	readonly content: string;
	readonly ranAt: string;
	readonly branch?: string;
}

export interface ReviewLogListRequest extends RoasterEnvironmentOptions {
	readonly reviewKey?: string;
}

export interface ReviewLogWriteResult {
	readonly namespace: string;
	readonly key: string;
	readonly branch: string;
	readonly entryLocator: string;
	readonly reviewKey: string;
	readonly ranAt: string;
}

export interface ReviewLogEntry {
	readonly key: string;
	readonly branch: string;
	readonly entryLocator: string;
	readonly reviewKey: string | null;
	readonly ranAt: string | null;
}

export interface ReviewLogGateway {
	writeReviewLog(request: ReviewLogWriteRequest): Promise<ReviewResult<ReviewLogWriteResult>>;
	listReviewLogs(request: ReviewLogListRequest): Promise<ReviewResult<readonly ReviewLogEntry[]>>;
}

export interface RealReviewLogGatewayOptions {
	readonly execApi: CommandExecApi;
}

export class RealReviewLogGateway implements ReviewLogGateway {
	private readonly execApi: CommandExecApi;

	constructor(options: RealReviewLogGatewayOptions) {
		this.execApi = options.execApi;
	}

	async writeReviewLog(
		request: ReviewLogWriteRequest,
	): Promise<ReviewResult<ReviewLogWriteResult>> {
		const entryKey = reviewLogEntryKey({ reviewKey: request.reviewKey, ranAt: request.ranAt });
		return await withTemporaryFile(
			{
				prefix: "roaster-review-log-",
				filename: "review.md",
				contents: request.content,
			},
			async (filePath) => {
				const result = await putBrmemEntryFromFile({
					gateway: this.execApi,
					cwd: request.cwd,
					namespace: ROASTER_REVIEW_LOG_NAMESPACE,
					key: entryKey,
					...(request.branch === undefined ? {} : { branch: request.branch }),
					sourceFile: filePath,
					...(request.env === undefined ? {} : { env: request.env }),
					signal: request.signal,
				});
				if (!result.ok) return reviewLogCommandError("review-log-write-failed", result.error);
				const data = result.value;
				return {
					ok: true,
					value: {
						namespace: data.namespace,
						key: data.key,
						branch: data.branch,
						entryLocator: data.refName,
						reviewKey: request.reviewKey,
						ranAt: request.ranAt,
					},
				};
			},
		);
	}

	async listReviewLogs(
		request: ReviewLogListRequest,
	): Promise<ReviewResult<readonly ReviewLogEntry[]>> {
		const result = await listBrmemEntries({
			gateway: this.execApi,
			cwd: request.cwd,
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			...(request.env === undefined ? {} : { env: request.env }),
			signal: request.signal,
		});
		if (!result.ok) return reviewLogCommandError("review-log-list-failed", result.error);
		const prefix = request.reviewKey === undefined ? null : reviewLogKeyPrefix(request.reviewKey);
		const entries = result.value.flatMap((entry) => {
			if (prefix !== null && !entry.key.startsWith(prefix)) return [];
			const parsed = parseReviewLogEntryKey(entry.key);
			if (parsed === null) return [];
			return [
				{
					key: entry.key,
					branch: entry.branch,
					entryLocator: entry.refName,
					reviewKey: parsed.reviewKey,
					ranAt: parsed.ranAt,
				},
			];
		});
		return { ok: true, value: sortReviewLogEntries(entries) };
	}
}

export interface FakeReviewLogGatewayOptions {
	readonly branch?: string;
	readonly entries?: readonly FakeReviewLogEntrySeed[];
	readonly writeFailure?: ReviewLogFailure;
	readonly listFailure?: ReviewLogFailure;
}

export interface FakeReviewLogEntrySeed {
	readonly key: string;
	readonly branch?: string;
	readonly entryLocator?: string;
	readonly reviewKey?: string | null;
	readonly ranAt?: string | null;
	readonly content?: string;
}

export interface WrittenReviewLogEntry extends ReviewLogWriteResult {
	readonly content: string;
}

export class FakeReviewLogGateway implements ReviewLogGateway {
	private readonly branch: string;
	private readonly entriesInternal: WrittenReviewLogEntry[] = [];
	private readonly writeFailure: ReviewLogFailure | undefined;
	private readonly listFailure: ReviewLogFailure | undefined;

	constructor(options: FakeReviewLogGatewayOptions = {}) {
		this.branch = options.branch ?? "feature";
		this.writeFailure = options.writeFailure;
		this.listFailure = options.listFailure;
		for (const entry of options.entries ?? []) this.entriesInternal.push(this.seededEntry(entry));
	}

	async writeReviewLog(
		request: ReviewLogWriteRequest,
	): Promise<ReviewResult<ReviewLogWriteResult>> {
		if (this.writeFailure !== undefined) return error(this.writeFailure);
		const key = reviewLogEntryKey({ reviewKey: request.reviewKey, ranAt: request.ranAt });
		const branch = request.branch ?? this.branch;
		const entry: WrittenReviewLogEntry = {
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			key,
			branch,
			entryLocator: reviewLogEntryLocator(branch, key),
			reviewKey: request.reviewKey,
			ranAt: request.ranAt,
			content: request.content,
		};
		this.entriesInternal.push(entry);
		return { ok: true, value: publicWriteResult(entry) };
	}

	async listReviewLogs(
		request: ReviewLogListRequest,
	): Promise<ReviewResult<readonly ReviewLogEntry[]>> {
		if (this.listFailure !== undefined) return error(this.listFailure);
		const prefix = request.reviewKey === undefined ? null : reviewLogKeyPrefix(request.reviewKey);
		const entries = this.entriesInternal
			.filter((entry) => prefix === null || entry.key.startsWith(prefix))
			.map(publicListEntry);
		return { ok: true, value: sortReviewLogEntries(entries) };
	}

	writtenEntries(): readonly WrittenReviewLogEntry[] {
		return this.entriesInternal.map((entry) => ({ ...entry }));
	}

	private seededEntry(seed: FakeReviewLogEntrySeed): WrittenReviewLogEntry {
		const parsed = parseReviewLogEntryKey(seed.key);
		const reviewKey = seed.reviewKey === undefined ? (parsed?.reviewKey ?? null) : seed.reviewKey;
		const ranAt = seed.ranAt === undefined ? (parsed?.ranAt ?? null) : seed.ranAt;
		return {
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			key: seed.key,
			branch: seed.branch ?? this.branch,
			entryLocator:
				seed.entryLocator ?? reviewLogEntryLocator(seed.branch ?? this.branch, seed.key),
			reviewKey: reviewKey ?? "unknown",
			ranAt: ranAt ?? "unknown",
			content: seed.content ?? "",
		};
	}
}

export interface ReviewLogMarkdownMetadata {
	readonly ranAt: string;
	readonly branch: string;
	readonly headCommit: string;
}

export function renderReviewLogMarkdown(
	result: ReviewRunResult,
	metadata: ReviewLogMarkdownMetadata,
): string {
	const lines = [
		renderReviewLogTitle(result),
		"",
		`- Ran at: ${metadata.ranAt}`,
		`- Review key: \`${result.reviewName}\``,
		`- Review path: \`${result.reviewPath}\``,
		`- Branch: \`${metadata.branch}\``,
		`- Head commit: \`${metadata.headCommit}\``,
		`- Base ref: \`${result.baseRef}\``,
		`- Model profile: \`${result.modelProfile}\``,
		`- Model: \`${result.model}\``,
		`- Findings: ${result.count}`,
		"",
		"## Findings",
		"",
	];
	if (result.findings.length === 0) {
		lines.push("_No findings._", "");
	} else {
		result.findings.forEach((finding, index) => {
			const location = `${finding.path ?? "unknown"}:${finding.line ?? "—"}`;
			lines.push(
				`### ${index + 1}. ${finding.severity} — \`${location}\``,
				"",
				finding.summary,
				"",
				finding.details,
				"",
			);
		});
	}
	if (result.usage !== null) lines.push(...renderUsage(result.usage));
	if (result.inputCoverage !== null) lines.push(...renderInputCoverage(result.inputCoverage));
	return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function renderReviewLogTitle(result: ReviewRunResult): string {
	if (roasterReviewDisplayRole(result.modelProfile) === "tripwire") {
		return `# Roaster Tripwire: ${result.reviewName}`;
	}
	return `# Roaster Review: ${result.reviewName}`;
}

export function reviewLogEntryKey(options: {
	readonly reviewKey: string;
	readonly ranAt: string;
}): string {
	return `${reviewLogKeyPrefix(options.reviewKey)}${safeTimestamp(options.ranAt)}.md`;
}

export function reviewLogKeyPrefix(reviewKey: string): string {
	return `${REVIEW_LOG_PREFIX}/${sanitizeReviewKeySegments(reviewKey).join("/")}/`;
}

export function parseReviewLogEntryKey(
	key: string,
): { readonly reviewKey: string; readonly ranAt: string } | null {
	const segments = key.split("/");
	if (segments.length < 3 || segments[0] !== REVIEW_LOG_PREFIX) return null;
	const filename = segments.at(-1);
	if (filename === undefined) return null;
	const match = TIMESTAMP_PATTERN.exec(filename);
	if (match === null) return null;
	const reviewSegments = segments.slice(1, -1);
	if (reviewSegments.length === 0) return null;
	const hour = match[1];
	const minute = match[2];
	const second = match[3];
	const millis = match[4];
	if (hour === undefined || minute === undefined || second === undefined || millis === undefined) {
		return null;
	}
	return {
		reviewKey: reviewSegments.join("/"),
		ranAt: `${hour}:${minute}:${second}.${millis}Z`,
	};
}

function sanitizeReviewKeySegments(reviewKey: string): readonly string[] {
	const segments = reviewKey
		.split("/")
		.map(sanitizeReviewKeySegment)
		.filter((segment) => segment !== "");
	return segments.length === 0 ? ["review"] : segments;
}

function sanitizeReviewKeySegment(segment: string): string {
	const sanitized = segment
		.replace(/[\u0000-\u001F\u007F\\:?*[\]~^\s]+/gu, "-")
		.replace(/[^A-Za-z0-9._-]+/gu, "-")
		.replace(/-+/gu, "-")
		.replace(/^-+|-+$/gu, "");
	if (sanitized === "" || sanitized === "." || sanitized === "..") return "review";
	if (sanitized.endsWith(".lock")) {
		const stem = sanitized.slice(0, -5);
		return stem === "" ? "lock" : `${stem}-lock`;
	}
	return sanitized;
}

function safeTimestamp(isoTimestamp: string): string {
	return isoTimestamp.replaceAll(":", "-").replace(".", "-");
}

function renderUsage(usage: ReviewUsage): readonly string[] {
	const inputTokens =
		usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
	return [
		"## Usage",
		"",
		`- Input tokens: ${inputTokens}`,
		`- Output tokens: ${usage.outputTokens}`,
		`- Cost: $${usage.totalCostUsd.toFixed(4)} USD`,
		`- Duration: ${(usage.durationMs / 1000).toFixed(1)}s`,
		`- Turns: ${usage.numTurns}`,
		"",
	];
}

function renderInputCoverage(inputCoverage: ReviewInputCoverage): readonly string[] {
	const lines = [
		"## Input Coverage",
		"",
		`- Changed files: ${inputCoverage.changedPathCount}`,
		`- Included files: ${inputCoverage.includedFileCount}`,
		`- Omitted files: ${inputCoverage.omittedFileCount}`,
		`- Full diff estimated tokens: ${inputCoverage.fullDiffEstimatedTokens}`,
		`- Prompt diff token cap: ${inputCoverage.promptDiffTokenCap}`,
		`- Prompt diff file token cap: ${inputCoverage.promptDiffFileTokenCap}`,
		"",
	];
	if (inputCoverage.omittedFiles.length > 0) {
		lines.push("### Omitted Files", "");
		for (const file of inputCoverage.omittedFiles) {
			lines.push(`- \`${file.path}\` (${file.reason}, ${file.estimatedTokens} estimated tokens)`);
		}
		lines.push("");
	}
	return lines;
}

function trimTrailingBlankLines(lines: readonly string[]): readonly string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end -= 1;
	return lines.slice(0, end);
}

function reviewLogEntryLocator(branch: string, key: string): string {
	return `refs/brmem/ns/${ROASTER_REVIEW_LOG_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`;
}

function sortReviewLogEntries(entries: readonly ReviewLogEntry[]): readonly ReviewLogEntry[] {
	return [...entries].sort((left, right) => {
		const rightTime = timestampMs(right.ranAt);
		const leftTime = timestampMs(left.ranAt);
		if (rightTime !== leftTime) return rightTime - leftTime;
		return left.key.localeCompare(right.key);
	});
}

function timestampMs(value: string | null): number {
	if (value === null) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function publicWriteResult(entry: WrittenReviewLogEntry): ReviewLogWriteResult {
	return {
		namespace: entry.namespace,
		key: entry.key,
		branch: entry.branch,
		entryLocator: entry.entryLocator,
		reviewKey: entry.reviewKey,
		ranAt: entry.ranAt,
	};
}

function publicListEntry(entry: WrittenReviewLogEntry): ReviewLogEntry {
	return {
		key: entry.key,
		branch: entry.branch,
		entryLocator: entry.entryLocator,
		reviewKey: entry.reviewKey,
		ranAt: entry.ranAt,
	};
}

function reviewLogCommandError(
	failureType: ReviewLogFailureCode,
	failure: BrmemCommandErrorInfo,
): ReviewResult<never> {
	if (failure.code.includes("malformed") || failure.code.includes("unexpected")) {
		return invalidResponse(failure.message);
	}
	return error({ code: failureType, message: failure.message });
}

function invalidResponse(message: string): ReviewResult<never> {
	return error({ code: "review-log-response-invalid", message });
}

function error(errorValue: ReviewLogFailure): ReviewResult<never> {
	return resultErr(errorValue);
}
