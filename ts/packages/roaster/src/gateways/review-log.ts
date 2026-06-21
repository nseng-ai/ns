import { runAvailableBrmemCommand, type CompletedBrmemRun } from "@sdl/core/brmem-cli";
import { commandFailureReason, type CommandExecApi } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import { withTemporaryFile } from "@sdl/core/temp-files";
import { z } from "zod";

import type { RoasterEnvironmentOptions } from "../context.ts";
import type { ReviewLogFailure, ReviewLogFailureType, RoasterResult } from "../failures.ts";
import type { ReviewInputCoverage, ReviewRunResult, ReviewUsage } from "../models.ts";

export const ROASTER_REVIEW_LOG_NAMESPACE = "roaster";
const REVIEW_LOG_PREFIX = "reviews";
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.md$/u;

const clinkrEnvelopeSchema = z
	.object({
		exit_code: z.number().int(),
		message: z.string().optional(),
		error_type: z.string().optional(),
	})
	.loose();
const brmemPutDataSchema = z
	.object({
		namespace: z.string(),
		key: z.string(),
		branch: z.string(),
		ref_name: z.string(),
		commit: z.string(),
		source_file: z.string(),
	})
	.loose();
const brmemListDataSchema = z
	.object({
		entries: z.array(
			z
				.object({
					namespace: z.string(),
					key: z.string(),
					branch: z.string(),
					ref_name: z.string(),
				})
				.loose(),
		),
	})
	.loose();

export interface ReviewLogWriteRequest extends RoasterEnvironmentOptions {
	readonly reviewKey: string;
	readonly content: string;
	readonly ranAt: string;
}

export interface ReviewLogListRequest extends RoasterEnvironmentOptions {
	readonly reviewKey?: string | undefined;
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
	writeReviewLog(request: ReviewLogWriteRequest): Promise<RoasterResult<ReviewLogWriteResult>>;
	listReviewLogs(request: ReviewLogListRequest): Promise<RoasterResult<readonly ReviewLogEntry[]>>;
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
	): Promise<RoasterResult<ReviewLogWriteResult>> {
		const entryKey = reviewLogEntryKey({ reviewKey: request.reviewKey, ranAt: request.ranAt });
		return await withTemporaryFile(
			{
				prefix: "roaster-review-log-",
				filename: "review.md",
				contents: request.content,
			},
			async (filePath) => {
				const args = [
					"put",
					entryKey,
					"--namespace",
					ROASTER_REVIEW_LOG_NAMESPACE,
					"--file",
					filePath,
					"--format",
					"json",
				];
				const run = await this.runBrmem(request, args, "review_log_write_failed");
				if (run.type === "error") return run;
				const result = run.value.result;
				if (result.code !== 0 || result.killed) {
					return error({
						type: "review_log_write_failed",
						message: `brmem put failed while writing roaster review log: ${commandFailureReason(result)}`,
					});
				}
				const envelope = parseEnvelope(result.stdout, brmemPutDataSchema, "brmem put");
				if (envelope.type === "error") return envelope;
				if (envelope.value.exitCode !== 0) {
					return error({
						type: "review_log_write_failed",
						message: `brmem put failed while writing roaster review log: ${envelope.value.message ?? `exit_code ${envelope.value.exitCode}`}`,
					});
				}
				if (envelope.value.data === undefined) {
					return invalidResponse("brmem put response omitted data");
				}
				const data = envelope.value.data;
				return {
					type: "ok",
					value: {
						namespace: data.namespace,
						key: data.key,
						branch: data.branch,
						entryLocator: data.ref_name,
						reviewKey: request.reviewKey,
						ranAt: request.ranAt,
					},
				};
			},
		);
	}

	async listReviewLogs(
		request: ReviewLogListRequest,
	): Promise<RoasterResult<readonly ReviewLogEntry[]>> {
		const args = ["list", "--namespace", ROASTER_REVIEW_LOG_NAMESPACE, "--format", "json"];
		const run = await this.runBrmem(request, args, "review_log_list_failed");
		if (run.type === "error") return run;
		const result = run.value.result;
		if (result.code !== 0 || result.killed) {
			return error({
				type: "review_log_list_failed",
				message: `brmem list failed while listing roaster review logs: ${commandFailureReason(result)}`,
			});
		}
		const envelope = parseEnvelope(result.stdout, brmemListDataSchema, "brmem list");
		if (envelope.type === "error") return envelope;
		if (envelope.value.exitCode !== 0) {
			return error({
				type: "review_log_list_failed",
				message: `brmem list failed while listing roaster review logs: ${envelope.value.message ?? `exit_code ${envelope.value.exitCode}`}`,
			});
		}
		if (envelope.value.data === undefined) {
			return invalidResponse("brmem list response omitted data");
		}
		const prefix = request.reviewKey === undefined ? null : reviewLogKeyPrefix(request.reviewKey);
		const entries = envelope.value.data.entries.flatMap((entry) => {
			if (entry.namespace !== ROASTER_REVIEW_LOG_NAMESPACE) return [];
			if (prefix !== null && !entry.key.startsWith(prefix)) return [];
			const parsed = parseReviewLogEntryKey(entry.key);
			if (parsed === null) return [];
			return [
				{
					key: entry.key,
					branch: entry.branch,
					entryLocator: entry.ref_name,
					reviewKey: parsed.reviewKey,
					ranAt: parsed.ranAt,
				},
			];
		});
		return { type: "ok", value: sortReviewLogEntries(entries) };
	}

	private async runBrmem(
		request: RoasterEnvironmentOptions,
		args: readonly string[],
		failureType: ReviewLogFailureType,
	): Promise<RoasterResult<CompletedBrmemRun>> {
		const run = await runAvailableBrmemCommand({
			gateway: this.execApi,
			cwd: request.cwd,
			brmemArgs: args,
			...(request.env === undefined ? {} : { env: request.env }),
			signal: request.signal,
		});
		if (!run.ok) {
			return error({
				type: failureType,
				message: run.error.message,
			});
		}
		return { type: "ok", value: run.value };
	}
}

export interface FakeReviewLogGatewayOptions {
	readonly branch?: string | undefined;
	readonly entries?: readonly FakeReviewLogEntrySeed[] | undefined;
	readonly writeFailure?: ReviewLogFailure | undefined;
	readonly listFailure?: ReviewLogFailure | undefined;
}

export interface FakeReviewLogEntrySeed {
	readonly key: string;
	readonly branch?: string | undefined;
	readonly entryLocator?: string | undefined;
	readonly reviewKey?: string | null | undefined;
	readonly ranAt?: string | null | undefined;
	readonly content?: string | undefined;
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
	): Promise<RoasterResult<ReviewLogWriteResult>> {
		if (this.writeFailure !== undefined) return error(this.writeFailure);
		const key = reviewLogEntryKey({ reviewKey: request.reviewKey, ranAt: request.ranAt });
		const entry: WrittenReviewLogEntry = {
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			key,
			branch: this.branch,
			entryLocator: reviewLogEntryLocator(this.branch, key),
			reviewKey: request.reviewKey,
			ranAt: request.ranAt,
			content: request.content,
		};
		this.entriesInternal.push(entry);
		return { type: "ok", value: publicWriteResult(entry) };
	}

	async listReviewLogs(
		request: ReviewLogListRequest,
	): Promise<RoasterResult<readonly ReviewLogEntry[]>> {
		if (this.listFailure !== undefined) return error(this.listFailure);
		const prefix = request.reviewKey === undefined ? null : reviewLogKeyPrefix(request.reviewKey);
		const entries = this.entriesInternal
			.filter((entry) => prefix === null || entry.key.startsWith(prefix))
			.map(publicListEntry);
		return { type: "ok", value: sortReviewLogEntries(entries) };
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
		`# Roaster Review: ${result.reviewName}`,
		"",
		`- Ran at: ${metadata.ranAt}`,
		`- Review key: \`${result.reviewName}\``,
		`- Review path: \`${result.reviewPath}\``,
		`- Branch: \`${metadata.branch}\``,
		`- Head commit: \`${metadata.headCommit}\``,
		`- Base ref: \`${result.baseRef}\``,
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

interface ParsedEnvelope<T> {
	readonly exitCode: number;
	readonly message?: string | undefined;
	readonly data?: T | undefined;
}

function parseEnvelope<T>(
	text: string,
	dataSchema: z.ZodType<T>,
	operation: string,
): RoasterResult<ParsedEnvelope<T>> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (caught) {
		return invalidResponse(`${operation} did not return valid JSON: ${formatErrorMessage(caught)}`);
	}
	const envelope = clinkrEnvelopeSchema.safeParse(parsed);
	if (!envelope.success) {
		return invalidResponse(
			`${operation} response did not match Clinkr envelope shape: ${z.prettifyError(envelope.error)}`,
		);
	}
	const dataValue = envelope.data["data"];
	if (dataValue === undefined) {
		return { type: "ok", value: envelopeValueWithoutData(envelope.data) };
	}
	const data = dataSchema.safeParse(dataValue);
	if (!data.success) {
		return invalidResponse(
			`${operation} response data did not match expected shape: ${z.prettifyError(data.error)}`,
		);
	}
	return { type: "ok", value: envelopeValue(envelope.data, data.data) };
}

function envelopeValue<T>(
	envelope: z.infer<typeof clinkrEnvelopeSchema>,
	data: T,
): ParsedEnvelope<T> {
	return {
		exitCode: envelope.exit_code,
		...(envelope.message === undefined ? {} : { message: envelope.message }),
		data,
	};
}

function envelopeValueWithoutData<T>(
	envelope: z.infer<typeof clinkrEnvelopeSchema>,
): ParsedEnvelope<T> {
	return {
		exitCode: envelope.exit_code,
		...(envelope.message === undefined ? {} : { message: envelope.message }),
	};
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

function invalidResponse(message: string): RoasterResult<never> {
	return error({ type: "review_log_response_invalid", message });
}

function error(errorValue: ReviewLogFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
}
