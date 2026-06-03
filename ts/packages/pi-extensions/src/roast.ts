import type { ExtensionAPI as PiExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	formatCliCommandOutput,
	parseCliCommandArgs,
	type CliCommandOutputDetails,
} from "./cli-command-extension.ts";

const COMMAND_NAME = "roast";
const ROASTER_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_REVIEW_FORMAT = "findings";

export interface ExecResult {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
}

type NotifyLevel = "info" | "warning" | "error";
type ReviewFormat = "findings" | "text";
type ReviewSeverity = "info" | "warning" | "error";
type PiCustomMessage = Parameters<PiExtensionAPI["sendMessage"]>[0];

export interface ExtensionCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setEditorText?(text: string): void;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	sendMessage?(message: PiCustomMessage): void;
}

export interface RoastOptions {
	baseRef?: string;
	model?: string;
	harness?: string;
	reviewFormat: ReviewFormat;
}

type RoastArgParseResult =
	| { type: "ok"; options: RoastOptions }
	| { type: "help" }
	| { type: "error"; message: string };

interface ClinkrEnvelope<T> {
	exitCode: number;
	data?: T;
	message?: string;
	errorType?: string;
}

interface MatchingReview {
	key: string;
	description: string;
	defaultModel: string | null;
	whenChanged: string[];
	matchedPaths: string[];
}

interface SkippedReview {
	key: string;
	description: string;
	defaultModel: string | null;
	whenChanged: string[];
	reason: string;
}

interface MatchingSelectionData {
	baseRef: string;
	changedPaths: string[];
	changedPathCount: number;
	selectedReviews: MatchingReview[];
	selectedCount: number;
	skippedReviews: SkippedReview[];
	skippedCount: number;
}

interface HarnessShowData {
	harnessName: string;
}

interface ReviewUsage {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	totalCostUsd: number;
	durationMs: number;
	numTurns: number;
}

interface ReviewFinding {
	path: string;
	line: number | null;
	severity: ReviewSeverity;
	summary: string;
	details: string;
}

interface ReviewRunBaseData {
	reviewName: string;
	reviewPath: string;
	model: string;
	baseRef: string;
	usage: ReviewUsage | null;
}

type ReviewRunData =
	| (ReviewRunBaseData & {
			format: "findings";
			findings: ReviewFinding[];
			count: number;
	  })
	| (ReviewRunBaseData & {
			format: "text";
			prose: string;
	  });

type JsonParseResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

type SubcommandResult<T> =
	| {
			type: "success";
			commandName: string;
			argv: string[];
			data: T;
			stdout: string;
			stderr: string;
			exitCode: number;
	  }
	| SubcommandFailure;

interface SubcommandFailure {
	type: "failure";
	commandName: string;
	argv: string[];
	exitCode: number;
	stdout: string;
	stderr: string;
	message: string;
	errorType?: string;
}

interface SuccessfulReviewRun {
	review: MatchingReview;
	data: ReviewRunData;
}

interface FailedReviewRun {
	review: MatchingReview;
	failure: SubcommandFailure;
}

interface RoastAggregate {
	selection?: MatchingSelectionData;
	harnessName?: string;
	successfulRuns: SuccessfulReviewRun[];
	failedRuns: FailedReviewRun[];
	setupFailures: SubcommandFailure[];
	missingModelReviews: MatchingReview[];
	reviewFormat: ReviewFormat;
}

export default function roastExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Run roaster reviewers whose when_changed globs match the current branch diff.",
		handler: async (rawArgs, ctx) => {
			await runRoast(pi, ctx, rawArgs);
		},
	});
}

export async function runRoast(pi: Pick<ExtensionAPI, "exec" | "sendMessage">, ctx: ExtensionCommandContext, rawArgs: string): Promise<void> {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) {
		restoreInvocationToEditor(ctx, rawArgs, `Could not parse /${COMMAND_NAME}: ${parsed.error}`);
		emitRoastText(pi, ctx, rawArgs, [], {
			exitCode: 2,
			level: "error",
			stdout: "",
			stderr: `Error: ${parsed.error}\n`,
		});
		return;
	}

	const argsResult = parseRoastArgs(parsed.args);
	if (argsResult.type === "help") {
		emitRoastText(pi, ctx, rawArgs, parsed.args, {
			exitCode: 0,
			level: "info",
			stdout: roastHelpText(),
			stderr: "",
		});
		return;
	}
	if (argsResult.type === "error") {
		restoreInvocationToEditor(ctx, rawArgs, `Could not parse /${COMMAND_NAME}: ${argsResult.message}`);
		emitRoastText(pi, ctx, rawArgs, parsed.args, {
			exitCode: 2,
			level: "error",
			stdout: "",
			stderr: `Error: ${argsResult.message}\n`,
		});
		return;
	}

	const options = argsResult.options;
	await ctx.waitForIdle();

	const aggregate: RoastAggregate = {
		successfulRuns: [],
		failedRuns: [],
		setupFailures: [],
		missingModelReviews: [],
		reviewFormat: options.reviewFormat,
	};

	try {
		setRoastStatus(ctx, "selecting matching roaster reviews…");
		const selectionResult = await runRoasterJson(pi, ctx, "review list-matching", buildSelectionArgs(options), parseMatchingSelectionData);
		if (selectionResult.type === "failure") {
			aggregate.setupFailures.push(selectionResult);
			emitAggregate(pi, ctx, rawArgs, parsed.args, aggregate);
			return;
		}
		aggregate.selection = selectionResult.data;

		if (selectionResult.data.selectedReviews.length === 0) {
			emitAggregate(pi, ctx, rawArgs, parsed.args, aggregate);
			return;
		}

		setRoastStatus(ctx, "resolving roaster harness…");
		const harnessResult = await runRoasterJson(pi, ctx, "harness show", buildHarnessShowArgs(options), parseHarnessShowData);
		if (harnessResult.type === "failure") {
			aggregate.setupFailures.push(harnessResult);
			emitAggregate(pi, ctx, rawArgs, parsed.args, aggregate);
			return;
		}
		aggregate.harnessName = harnessResult.data.harnessName;

		const missingModelReviews = findMissingModelReviews(selectionResult.data.selectedReviews, options);
		if (missingModelReviews.length > 0) {
			aggregate.missingModelReviews = missingModelReviews;
			emitAggregate(pi, ctx, rawArgs, parsed.args, aggregate);
			return;
		}

		for (const [index, review] of selectionResult.data.selectedReviews.entries()) {
			setRoastStatus(ctx, `running ${index + 1}/${selectionResult.data.selectedReviews.length} ${review.key}…`);
			const runResult = await runRoasterJson(
				pi,
				ctx,
				`review run ${review.key}`,
				buildReviewRunArgs({ options, review, harnessName: harnessResult.data.harnessName }),
				parseReviewRunData,
			);
			if (runResult.type === "failure") {
				aggregate.failedRuns.push({ review, failure: runResult });
				continue;
			}
			aggregate.successfulRuns.push({ review, data: runResult.data });
		}

		emitAggregate(pi, ctx, rawArgs, parsed.args, aggregate);
	} finally {
		setRoastStatus(ctx, undefined);
	}
}

export function parseRoastArgs(args: readonly string[]): RoastArgParseResult {
	if (args.length === 0) {
		return { type: "ok", options: { reviewFormat: DEFAULT_REVIEW_FORMAT } };
	}
	if (args.length === 1 && args[0] === "--help") {
		return { type: "help" };
	}

	const options: RoastOptions = { reviewFormat: DEFAULT_REVIEW_FORMAT };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			return { type: "error", message: "Unexpected empty argument." };
		}
		if (arg.includes("=")) {
			return { type: "error", message: `/${COMMAND_NAME} only accepts space-separated option values; got ${arg}.` };
		}
		if (!arg.startsWith("--")) {
			return { type: "error", message: `Unexpected positional argument ${arg}. Use --help for usage.` };
		}
		if (arg === "--help") {
			return { type: "error", message: "--help must be used by itself." };
		}
		if (arg === "--format") {
			return { type: "error", message: "/roast does not support --format; it renders a Pi aggregate result." };
		}
		if (!isSupportedValueOption(arg)) {
			return { type: "error", message: `Unsupported /${COMMAND_NAME} option ${arg}. Use --help for usage.` };
		}

		const value = args[index + 1];
		if (value === undefined || value.startsWith("--")) {
			return { type: "error", message: `Option ${arg} requires a value.` };
		}
		if (value.trim() === "") {
			return { type: "error", message: `Option ${arg} requires a non-empty value.` };
		}

		if (arg === "--base-ref") options.baseRef = value;
		if (arg === "--model") options.model = value;
		if (arg === "--harness") options.harness = value;
		if (arg === "--review-format") {
			if (value !== "findings" && value !== "text") {
				return { type: "error", message: "--review-format must be either 'findings' or 'text'." };
			}
			options.reviewFormat = value;
		}
		index += 1;
	}

	return { type: "ok", options };
}

function isSupportedValueOption(arg: string): boolean {
	return arg === "--base-ref" || arg === "--model" || arg === "--harness" || arg === "--review-format";
}

function buildSelectionArgs(options: RoastOptions): string[] {
	const args = ["review", "list-matching"];
	if (options.baseRef !== undefined) {
		args.push("--base-ref", options.baseRef);
	}
	args.push("--format", "json");
	return args;
}

function buildHarnessShowArgs(options: RoastOptions): string[] {
	const args = ["harness", "show"];
	if (options.harness !== undefined) {
		args.push(options.harness);
	}
	args.push("--format", "json");
	return args;
}

function buildReviewRunArgs(options: { options: RoastOptions; review: MatchingReview; harnessName: string }): string[] {
	const args = ["review", "run", options.review.key, "--review-format", options.options.reviewFormat, "--harness", options.harnessName];
	if (options.options.baseRef !== undefined) {
		args.push("--base-ref", options.options.baseRef);
	}
	if (options.options.model !== undefined) {
		args.push("--model", options.options.model);
	}
	args.push("--format", "json");
	return args;
}

async function runRoasterJson<T>(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	commandName: string,
	argv: string[],
	parseData: (value: unknown) => JsonParseResult<T>,
): Promise<SubcommandResult<T>> {
	const result = await pi.exec("uv", ["run", "roaster", ...argv], {
		cwd: ctx.cwd,
		timeout: ROASTER_TIMEOUT_MS,
	});
	const stdout = result.stdout ?? "";
	const stderr = result.stderr ?? "";
	const envelopeResult = parseClinkrEnvelope(stdout, parseData);
	if (result.code !== 0) {
		return buildSubcommandFailure({ commandName, argv, exitCode: result.code, stdout, stderr, envelopeResult });
	}
	if (envelopeResult.type === "error") {
		return {
			type: "failure",
			commandName,
			argv,
			exitCode: 2,
			stdout,
			stderr,
			message: envelopeResult.message,
		};
	}
	if (envelopeResult.value.exitCode !== 0) {
		return buildSubcommandFailure({ commandName, argv, exitCode: envelopeResult.value.exitCode, stdout, stderr, envelopeResult });
	}
	if (envelopeResult.value.data === undefined) {
		return {
			type: "failure",
			commandName,
			argv,
			exitCode: 2,
			stdout,
			stderr,
			message: `${commandName} JSON envelope did not include data.`,
		};
	}
	return {
		type: "success",
		commandName,
		argv,
		data: envelopeResult.value.data,
		stdout,
		stderr,
		exitCode: result.code,
	};
}

function buildSubcommandFailure<T>(options: {
	commandName: string;
	argv: string[];
	exitCode: number;
	stdout: string;
	stderr: string;
	envelopeResult: JsonParseResult<ClinkrEnvelope<T>>;
}): SubcommandFailure {
	const { commandName, argv, exitCode, stdout, stderr, envelopeResult } = options;
	if (envelopeResult.type === "ok") {
		const failure: SubcommandFailure = {
			type: "failure",
			commandName,
			argv,
			exitCode,
			stdout,
			stderr,
			message: envelopeResult.value.message ?? `${commandName} exited with code ${exitCode}.`,
		};
		if (envelopeResult.value.errorType !== undefined) {
			failure.errorType = envelopeResult.value.errorType;
		}
		return failure;
	}
	return {
		type: "failure",
		commandName,
		argv,
		exitCode,
		stdout,
		stderr,
		message: envelopeResult.message,
	};
}

function parseClinkrEnvelope<T>(stdout: string, parseData: (value: unknown) => JsonParseResult<T>): JsonParseResult<ClinkrEnvelope<T>> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		return { type: "error", message: `Could not parse roaster JSON output: ${errorMessage(error)}` };
	}
	if (!isRecord(parsed)) {
		return { type: "error", message: "Roaster JSON output must be an object." };
	}
	const exitCode = parsed.exit_code;
	if (!isNumber(exitCode)) {
		return { type: "error", message: "Roaster JSON envelope missing numeric exit_code." };
	}

	const envelope: ClinkrEnvelope<T> = { exitCode };
	if (typeof parsed.message === "string") envelope.message = parsed.message;
	if (typeof parsed.error_type === "string") envelope.errorType = parsed.error_type;
	if ("data" in parsed) {
		const dataResult = parseData(parsed.data);
		if (dataResult.type === "error") return dataResult;
		envelope.data = dataResult.value;
	}
	return { type: "ok", value: envelope };
}

function parseMatchingSelectionData(value: unknown): JsonParseResult<MatchingSelectionData> {
	if (!isRecord(value)) return { type: "error", message: "list-matching data must be an object." };
	const baseRef = readString(value, "base_ref");
	const changedPaths = readStringArray(value, "changed_paths");
	const changedPathCount = readNumber(value, "changed_path_count");
	const selectedReviews = readArray(value, "selected_reviews", parseMatchingReview);
	const selectedCount = readNumber(value, "selected_count");
	const skippedReviews = readArray(value, "skipped_reviews", parseSkippedReview);
	const skippedCount = readNumber(value, "skipped_count");
	const firstError = firstParseError(baseRef, changedPaths, changedPathCount, selectedReviews, selectedCount, skippedReviews, skippedCount);
	if (firstError !== undefined) return firstError;
	return {
		type: "ok",
		value: {
			baseRef: okValue(baseRef),
			changedPaths: okValue(changedPaths),
			changedPathCount: okValue(changedPathCount),
			selectedReviews: okValue(selectedReviews),
			selectedCount: okValue(selectedCount),
			skippedReviews: okValue(skippedReviews),
			skippedCount: okValue(skippedCount),
		},
	};
}

function parseMatchingReview(value: unknown): JsonParseResult<MatchingReview> {
	if (!isRecord(value)) return { type: "error", message: "selected review must be an object." };
	const key = readString(value, "key");
	const description = readString(value, "description");
	const defaultModel = readNullableString(value, "default_model");
	const whenChanged = readStringArray(value, "when_changed");
	const matchedPaths = readStringArray(value, "matched_paths");
	const firstError = firstParseError(key, description, defaultModel, whenChanged, matchedPaths);
	if (firstError !== undefined) return firstError;
	return {
		type: "ok",
		value: {
			key: okValue(key),
			description: okValue(description),
			defaultModel: okValue(defaultModel),
			whenChanged: okValue(whenChanged),
			matchedPaths: okValue(matchedPaths),
		},
	};
}

function parseSkippedReview(value: unknown): JsonParseResult<SkippedReview> {
	if (!isRecord(value)) return { type: "error", message: "skipped review must be an object." };
	const base = parseMatchingReview({ ...value, matched_paths: [] });
	if (base.type === "error") return base;
	const reason = readString(value, "reason");
	if (reason.type === "error") return reason;
	return {
		type: "ok",
		value: {
			key: base.value.key,
			description: base.value.description,
			defaultModel: base.value.defaultModel,
			whenChanged: base.value.whenChanged,
			reason: reason.value,
		},
	};
}

function parseHarnessShowData(value: unknown): JsonParseResult<HarnessShowData> {
	if (!isRecord(value)) return { type: "error", message: "harness show data must be an object." };
	const harnessName = readString(value, "harness_name");
	if (harnessName.type === "error") return harnessName;
	return { type: "ok", value: { harnessName: harnessName.value } };
}

function parseReviewRunData(value: unknown): JsonParseResult<ReviewRunData> {
	if (!isRecord(value)) return { type: "error", message: "review run data must be an object." };
	const reviewName = readString(value, "review_name");
	const reviewPath = readString(value, "review_path");
	const model = readString(value, "model");
	const baseRef = readString(value, "base_ref");
	const usage = parseNullableUsage(value.usage);
	const format = readString(value, "format");
	const firstError = firstParseError(reviewName, reviewPath, model, baseRef, usage, format);
	if (firstError !== undefined) return firstError;

	const formatValue = okValue(format);
	const base = {
		reviewName: okValue(reviewName),
		reviewPath: okValue(reviewPath),
		model: okValue(model),
		baseRef: okValue(baseRef),
		usage: okValue(usage),
	};
	if (formatValue === "findings") {
		const findings = readArray(value, "findings", parseReviewFinding);
		const count = readNumber(value, "count");
		const findingsError = firstParseError(findings, count);
		if (findingsError !== undefined) return findingsError;
		return { type: "ok", value: { ...base, format: "findings", findings: okValue(findings), count: okValue(count) } };
	}
	if (formatValue === "text") {
		const prose = readString(value, "prose");
		if (prose.type === "error") return prose;
		return { type: "ok", value: { ...base, format: "text", prose: okValue(prose) } };
	}
	return { type: "error", message: `Unsupported review result format ${formatValue}.` };
}

function parseReviewFinding(value: unknown): JsonParseResult<ReviewFinding> {
	if (!isRecord(value)) return { type: "error", message: "review finding must be an object." };
	const path = readString(value, "path");
	const line = readNullableNumber(value, "line");
	const severity = readSeverity(value, "severity");
	const summary = readString(value, "summary");
	const details = readString(value, "details");
	const firstError = firstParseError(path, line, severity, summary, details);
	if (firstError !== undefined) return firstError;
	return {
		type: "ok",
		value: {
			path: okValue(path),
			line: okValue(line),
			severity: okValue(severity),
			summary: okValue(summary),
			details: okValue(details),
		},
	};
}

function parseNullableUsage(value: unknown): JsonParseResult<ReviewUsage | null> {
	if (value === null || value === undefined) return { type: "ok", value: null };
	if (!isRecord(value)) return { type: "error", message: "usage must be an object or null." };
	const inputTokens = readNumber(value, "input_tokens");
	const outputTokens = readNumber(value, "output_tokens");
	const cacheCreationInputTokens = readNumber(value, "cache_creation_input_tokens");
	const cacheReadInputTokens = readNumber(value, "cache_read_input_tokens");
	const totalCostUsd = readNumber(value, "total_cost_usd");
	const durationMs = readNumber(value, "duration_ms");
	const numTurns = readNumber(value, "num_turns");
	const firstError = firstParseError(inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, totalCostUsd, durationMs, numTurns);
	if (firstError !== undefined) return firstError;
	return {
		type: "ok",
		value: {
			inputTokens: okValue(inputTokens),
			outputTokens: okValue(outputTokens),
			cacheCreationInputTokens: okValue(cacheCreationInputTokens),
			cacheReadInputTokens: okValue(cacheReadInputTokens),
			totalCostUsd: okValue(totalCostUsd),
			durationMs: okValue(durationMs),
			numTurns: okValue(numTurns),
		},
	};
}

function findMissingModelReviews(reviews: readonly MatchingReview[], options: RoastOptions): MatchingReview[] {
	if (options.model !== undefined && options.model.trim() !== "") return [];
	return reviews.filter((review) => review.defaultModel === null || review.defaultModel.trim() === "");
}

function emitAggregate(
	pi: Pick<ExtensionAPI, "sendMessage">,
	ctx: ExtensionCommandContext,
	rawArgs: string,
	args: readonly string[],
	aggregate: RoastAggregate,
): void {
	const hardErrorCount = aggregate.setupFailures.length + aggregate.failedRuns.length + aggregate.missingModelReviews.length;
	const findingsCount = countFindings(aggregate.successfulRuns);
	const level: NotifyLevel = hardErrorCount > 0 ? "error" : findingsCount > 0 ? "warning" : "info";
	const exitCode = hardErrorCount > 0 ? 2 : 0;
	const text = formatRoastAggregate(aggregate);
	emitRoastText(pi, ctx, rawArgs, args, {
		exitCode,
		level,
		stdout: exitCode === 0 ? text : "",
		stderr: exitCode === 0 ? "" : text,
	});
}

function formatRoastAggregate(aggregate: RoastAggregate): string {
	const lines: string[] = [];
	const selection = aggregate.selection;
	if (selection === undefined) {
		lines.push("Roast failed before matching reviewers.");
	} else {
		lines.push(`Roast summary: base_ref=${selection.baseRef}, changed_paths=${selection.changedPathCount}, selected=${selection.selectedCount}, skipped=${selection.skippedCount}`);
	}
	const findingsCount = countFindings(aggregate.successfulRuns);
	if (aggregate.reviewFormat === "findings") {
		lines.push(`Findings: ${findingsCount}`);
	}
	const usage = totalUsage(aggregate.successfulRuns);
	if (usage !== null) {
		lines.push(`Usage: ${formatUsage(usage)}`);
	}
	if (aggregate.harnessName !== undefined) {
		lines.push(`Harness: ${aggregate.harnessName}`);
	}

	if (selection !== undefined && selection.skippedReviews.length > 0) {
		lines.push("", "Skipped reviewers:");
		for (const review of selection.skippedReviews) {
			lines.push(`- ${review.key} (patterns: ${formatPatterns(review.whenChanged)})`);
		}
	}

	if (selection !== undefined && selection.selectedReviews.length === 0) {
		lines.push("", "No matching reviews; no reviewers were run.");
	}

	if (aggregate.missingModelReviews.length > 0) {
		lines.push("", "Setup errors:");
		for (const review of aggregate.missingModelReviews) {
			lines.push(`- ${review.key}: no model provided and review has no default_model.`);
		}
	}
	if (aggregate.setupFailures.length > 0) {
		lines.push("", "Setup command errors:");
		for (const failure of aggregate.setupFailures) {
			appendFailure(lines, failure);
		}
	}

	if (aggregate.successfulRuns.length > 0) {
		lines.push("", "Review results:");
		for (const run of aggregate.successfulRuns) {
			appendSuccessfulRun(lines, run);
		}
	}

	if (aggregate.failedRuns.length > 0) {
		lines.push("", "Review command errors:");
		for (const run of aggregate.failedRuns) {
			lines.push(`- ${run.review.key}:`);
			appendFailure(lines, run.failure, "  ");
		}
	}

	return `${lines.join("\n")}\n`;
}

function appendSuccessfulRun(lines: string[], run: SuccessfulReviewRun): void {
	const usageText = run.data.usage === null ? "" : ` (${formatUsage(run.data.usage)})`;
	lines.push(`- ${run.review.key}${usageText}`);
	if (run.data.format === "text") {
		lines.push(indentBlock(run.data.prose.trim() === "" ? "(empty prose review)" : run.data.prose, "  "));
		return;
	}
	if (run.data.findings.length === 0) {
		lines.push("  No findings.");
		return;
	}
	for (const finding of run.data.findings) {
		const location = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
		lines.push(`  - [${finding.severity}] ${location} ${finding.summary}`);
		lines.push(`    ${finding.details}`);
	}
}

function appendFailure(lines: string[], failure: SubcommandFailure, prefix = ""): void {
	const errorType = failure.errorType === undefined ? "" : `${failure.errorType}: `;
	lines.push(`${prefix}- ${failure.commandName}: ${errorType}${failure.message} (exit ${failure.exitCode})`);
	if (failure.stdout !== "") {
		lines.push(`${prefix}  stdout:`);
		lines.push(indentBlock(failure.stdout.trimEnd(), `${prefix}    `));
	}
	if (failure.stderr !== "") {
		lines.push(`${prefix}  stderr:`);
		lines.push(indentBlock(failure.stderr.trimEnd(), `${prefix}    `));
	}
}

function countFindings(runs: readonly SuccessfulReviewRun[]): number {
	let count = 0;
	for (const run of runs) {
		if (run.data.format === "findings") {
			count += run.data.findings.length;
		}
	}
	return count;
}

function totalUsage(runs: readonly SuccessfulReviewRun[]): ReviewUsage | null {
	let total: ReviewUsage | null = null;
	for (const run of runs) {
		const usage = run.data.usage;
		if (usage === null) continue;
		if (total === null) {
			total = { ...usage };
			continue;
		}
		total = {
			inputTokens: total.inputTokens + usage.inputTokens,
			outputTokens: total.outputTokens + usage.outputTokens,
			cacheCreationInputTokens: total.cacheCreationInputTokens + usage.cacheCreationInputTokens,
			cacheReadInputTokens: total.cacheReadInputTokens + usage.cacheReadInputTokens,
			totalCostUsd: total.totalCostUsd + usage.totalCostUsd,
			durationMs: total.durationMs + usage.durationMs,
			numTurns: total.numTurns + usage.numTurns,
		};
	}
	return total;
}

function formatUsage(usage: ReviewUsage): string {
	const inputTokens = usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
	return `${inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out, $${usage.totalCostUsd.toFixed(4)}, ${(usage.durationMs / 1000).toFixed(1)}s, ${usage.numTurns} turn${usage.numTurns === 1 ? "" : "s"}`;
}

function formatPatterns(patterns: readonly string[]): string {
	if (patterns.length === 0) return "always";
	return patterns.join(", ");
}

function indentBlock(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}

function roastHelpText(): string {
	return [
		"/roast runs roaster reviewers whose when_changed globs match the current branch diff.",
		"",
		"Workflow:",
		"  1. list matching reviewers with roaster review list-matching",
		"  2. resolve the review harness",
		"  3. run each selected reviewer sequentially",
		"  4. render one aggregate Pi message",
		"",
		"Options:",
		"  --base-ref VALUE           Base branch/ref to diff against.",
		"  --model VALUE              Model to use for every selected reviewer.",
		"  --harness VALUE            Harness name to validate and use.",
		"  --review-format VALUE      findings or text (default: findings).",
		"  --help                     Show this help. Must be used by itself.",
		"",
		"Values must be passed as separate arguments, e.g. --model haiku. /roast does not accept --model=haiku or --format.",
	].join("\n");
}

function emitRoastText(
	pi: Pick<ExtensionAPI, "sendMessage">,
	ctx: ExtensionCommandContext,
	rawArgs: string,
	args: readonly string[],
	result: { exitCode: number; level: NotifyLevel; stdout: string; stderr: string },
): void {
	emitRoastOutput(
		pi,
		ctx,
		buildOutputDetails({
			rawArgs,
			args,
			cwd: ctx.cwd,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			level: result.level,
		}),
	);
}

function buildOutputDetails(options: {
	rawArgs: string;
	args: readonly string[];
	cwd: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	level: NotifyLevel;
}): CliCommandOutputDetails {
	return {
		cliName: "roaster",
		commandName: "roast",
		piCommandName: COMMAND_NAME,
		rawArgs: options.rawArgs,
		args: [...options.args],
		argv: [COMMAND_NAME, ...options.args],
		cwd: options.cwd,
		exitCode: options.exitCode,
		stdout: options.stdout,
		stderr: options.stderr,
		level: options.level,
	};
}

function emitRoastOutput(pi: Pick<ExtensionAPI, "sendMessage">, ctx: ExtensionCommandContext, details: CliCommandOutputDetails): void {
	const content = formatCliCommandOutput(details);
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, details.level);
}

function restoreInvocationToEditor(ctx: ExtensionCommandContext, rawArgs: string, reason: string): void {
	if (!ctx.hasUI || ctx.ui.setEditorText === undefined) {
		return;
	}

	const invocation = rawArgs === "" ? `/${COMMAND_NAME}` : `/${COMMAND_NAME} ${rawArgs}`;
	ctx.ui.setEditorText(invocation);
	ctx.ui.notify(`${reason} The text was restored to the editor.`, "warning");
}

function setRoastStatus(ctx: ExtensionCommandContext, value: string | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus?.("roast", value);
}

function readString(record: Record<string, unknown>, key: string): JsonParseResult<string> {
	const value = record[key];
	if (typeof value !== "string") return { type: "error", message: `Expected string field ${key}.` };
	return { type: "ok", value };
}

function readNullableString(record: Record<string, unknown>, key: string): JsonParseResult<string | null> {
	const value = record[key];
	if (value === null) return { type: "ok", value: null };
	if (typeof value !== "string") return { type: "error", message: `Expected string or null field ${key}.` };
	return { type: "ok", value };
}

function readNumber(record: Record<string, unknown>, key: string): JsonParseResult<number> {
	const value = record[key];
	if (!isNumber(value)) return { type: "error", message: `Expected numeric field ${key}.` };
	return { type: "ok", value };
}

function readNullableNumber(record: Record<string, unknown>, key: string): JsonParseResult<number | null> {
	const value = record[key];
	if (value === null) return { type: "ok", value: null };
	if (!isNumber(value)) return { type: "error", message: `Expected numeric or null field ${key}.` };
	return { type: "ok", value };
}

function readSeverity(record: Record<string, unknown>, key: string): JsonParseResult<ReviewSeverity> {
	const value = record[key];
	if (value === "info" || value === "warning" || value === "error") return { type: "ok", value };
	return { type: "error", message: `Expected severity field ${key}.` };
}

function readStringArray(record: Record<string, unknown>, key: string): JsonParseResult<string[]> {
	return readArray(record, key, (value) => {
		if (typeof value !== "string") return { type: "error", message: `Expected string item in ${key}.` };
		return { type: "ok", value };
	});
}

function readArray<T>(record: Record<string, unknown>, key: string, parseItem: (value: unknown) => JsonParseResult<T>): JsonParseResult<T[]> {
	const value = record[key];
	if (!Array.isArray(value)) return { type: "error", message: `Expected array field ${key}.` };
	const items: T[] = [];
	for (const item of value) {
		const result = parseItem(item);
		if (result.type === "error") return result;
		items.push(result.value);
	}
	return { type: "ok", value: items };
}

function firstParseError(...results: JsonParseResult<unknown>[]): JsonParseResult<never> | undefined {
	for (const result of results) {
		if (result.type === "error") return result;
	}
	return undefined;
}

function okValue<T>(result: JsonParseResult<T>): T {
	if (result.type === "error") {
		throw new Error(`Parse result invariant violated: ${result.message}`);
	}
	return result.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
