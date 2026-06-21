import { readFileSync } from "node:fs";

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { formatZodError } from "@sdl/core/primitives";
import { z } from "zod";

import { parseCliCommandArgs } from "./cli-command-extension.ts";
import {
	parseMachineEnvelopeData,
	type MachineEnvelopeDataParseResult,
} from "./machine-envelope.ts";
import { definePiSurfaceParity } from "./parity.ts";
import {
	PrPreviewFeedbackView,
	type PrPreviewFeedbackComment,
	type PrPreviewFeedbackCounts,
	type PrPreviewFeedbackTarget,
	type PrPreviewFeedbackThread,
	type PrPreviewFeedbackViewModel,
} from "./pr-preview-feedback-view.ts";

export const PR_DOWNLOAD_FEEDBACK_COMMAND_NAME = "pr:download-feedback";
export const PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME = "pr:download-stack-feedback";
export const PR_PREVIEW_FEEDBACK_COMMAND_NAME = "pr:preview-feedback";

const DOWNLOAD_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_FEEDBACK_COMMAND_NAME;
const DOWNLOAD_STACK_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME;
const PREVIEW_FEEDBACK_STATUS_KEY = PR_PREVIEW_FEEDBACK_COMMAND_NAME;
const COMMAND_TIMEOUT_MS = 60_000;
const STACK_DISCOVERY_TIMEOUT_MS = 120_000;
const STACK_FEEDBACK_INSTRUCTIONS = readFileSync(
	new URL("./pr-stack-feedback-instructions.md", import.meta.url),
	"utf8",
).trim();

const stackBranchesDataSchema = z.looseObject({
	branches: z.array(z.string()),
});

const branchPrEntrySchema = z.looseObject({
	branch: z.string(),
	pr_number: z.number().int().positive(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
});

const mapBranchPrsDataSchema = z.looseObject({
	branch_prs: z.array(branchPrEntrySchema),
});

const markdownDataSchema = z.looseObject({
	markdown: z.string(),
});

const downloadFeedbackCountsSchema = z.looseObject({
	included_review_threads: z.number().int().nonnegative(),
	included_reviews: z.number().int().nonnegative(),
	included_discussion_comments: z.number().int().nonnegative(),
	excluded_resolved_threads: z.number().int().nonnegative(),
	excluded_empty_reviews: z.number().int().nonnegative(),
	excluded_automation_comments: z.number().int().nonnegative(),
});

const stackMarkdownDataSchema = z.looseObject({
	markdown: z.string(),
	counts: downloadFeedbackCountsSchema,
});

const nullablePreviewStringSchema = z.string().nullable();
const nullablePreviewNumberSchema = z.number().int().nullable();

const previewTargetSchema = z.looseObject({
	pr_number: nullablePreviewNumberSchema,
	title: nullablePreviewStringSchema,
	url: nullablePreviewStringSchema,
	branch: nullablePreviewStringSchema,
	head_ref_name: nullablePreviewStringSchema,
	base_ref_name: nullablePreviewStringSchema,
});

const previewDownloadFeedbackDataSchema = z.looseObject({
	found: z.boolean(),
	target: previewTargetSchema,
	counts: downloadFeedbackCountsSchema,
});

const previewReviewCommentSchema = z.looseObject({
	id: z.number().int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: nullablePreviewNumberSchema,
	start_line: nullablePreviewNumberSchema,
	created_at: z.string(),
});

const previewReviewThreadSchema = z.looseObject({
	id: z.string(),
	path: z.string(),
	line: nullablePreviewNumberSchema,
	start_line: nullablePreviewNumberSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(previewReviewCommentSchema),
});

const previewReviewThreadsDataSchema = z.looseObject({
	review_threads: z.array(previewReviewThreadSchema),
});

type BranchPrEntry = z.output<typeof branchPrEntrySchema>;
type DownloadFeedbackCounts = z.output<typeof downloadFeedbackCountsSchema>;
type PreviewDownloadFeedbackData = z.output<typeof previewDownloadFeedbackDataSchema>;
type PreviewReviewThreadsData = z.output<typeof previewReviewThreadsDataSchema>;

interface StackFeedbackDownload {
	entry: BranchPrEntry;
	markdown: string;
	counts: DownloadFeedbackCounts;
}

export const prExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
		workflow: "Download current PR feedback into the Pi editor as a triage prompt",
		parity: "FULL",
		cli: "pr-address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "pr",
		notes: "Pi owns editor prefill; pr-address owns portable collection and Markdown rendering.",
	},
	{
		kind: "command",
		surface: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		workflow:
			"Download every PR's feedback from the current Graphite stack into the Pi editor as one triage prompt",
		parity: "FULL",
		cli: "slot gt exec stack-branches + pr-address exec map-branch-prs + pr-address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "pr",
		notes:
			"Pi orchestrates stack discovery and editor prefill; slot owns Graphite stack discovery and pr-address owns PR feedback collection/Markdown rendering.",
	},
	{
		kind: "command",
		surface: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
		workflow: "Preview unresolved PR review threads in a read-only Pi modal overlay",
		parity: "WAIVED",
		fallback:
			"Use pr-address exec download-feedback --format json, then pr-address exec pr-review-threads --pr-number <n> --format json.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "pr",
		notes:
			"The browser modal is Pi-native TUI/session behavior; pr-address owns portable read-only feedback collection.",
	},
] as const);

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface ExtensionContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
		setEditorText?(text: string): void;
		custom?<T>(
			factory: (
				tui: TUI,
				theme: Theme,
				keybindings: unknown,
				done: (value: T) => void,
			) => Component,
			options?: unknown,
		): Promise<T>;
	};
}

export interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

export interface ExtensionAPI {
	registerCommand(name: string, command: RegisteredCommand): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string, options?: unknown): void;
}

export default function prExtension(pi: ExtensionAPI): void {
	pi.registerCommand(PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, {
		description: "Download current PR feedback into the editor as a triage prompt.",
		handler: async (rawArgs, ctx) => {
			await runPrDownloadFeedbackCommand(pi, rawArgs, ctx);
		},
	});
	pi.registerCommand(PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME, {
		description:
			"Download feedback from every PR in the current Graphite stack into the editor as a triage prompt.",
		handler: async (rawArgs, ctx) => {
			await runPrDownloadStackFeedbackCommand(pi, rawArgs, ctx);
		},
	});
	pi.registerCommand(PR_PREVIEW_FEEDBACK_COMMAND_NAME, {
		description: "Preview unresolved PR review threads in a read-only modal overlay.",
		handler: async (rawArgs, ctx) => {
			await runPrPreviewFeedbackCommand(pi, rawArgs, ctx);
		},
	});
}

async function runPrDownloadFeedbackCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionContext,
): Promise<void> {
	const parsedArgs = parseOptionalPrNumberArgs(rawArgs, "Usage: /pr:download-feedback [pr-number]");
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, "PR feedback: downloading…");
	try {
		const args = ["exec", "download-feedback", ...parsedArgs.args, "--format", "json"];
		const result = await pi.exec("pr-address", args, { cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS });
		const parsed = parseEnvelopeWithSchema({
			label: "pr-address download-feedback",
			result,
			schema: markdownDataSchema,
			allowFailureData: true,
		});
		if (parsed.type === "error") {
			notify(ctx, parsed.message, "error");
			return;
		}

		const message =
			result.code === 0
				? "Downloaded PR feedback into the editor. Review/edit, then press Enter."
				: "Downloaded PR feedback report into the editor. Review/edit, then press Enter.";
		prefillEditor(ctx, parsed.value.markdown, message);
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, undefined);
	}
}

async function runPrDownloadStackFeedbackCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionContext,
): Promise<void> {
	const parsedArgs = parseNoArgs(rawArgs, "Usage: /pr:download-stack-feedback");
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, "PR stack feedback: discovering stack…");
	try {
		const stackBranches = await loadStackBranches(pi, ctx);
		if (stackBranches.type === "error") {
			notify(ctx, stackBranches.message, "error");
			return;
		}
		if (stackBranches.branches.length === 0) {
			notify(ctx, "No Graphite stack branches found for the current checkout.", "warning");
			return;
		}

		ctx.ui?.setStatus?.(
			DOWNLOAD_STACK_FEEDBACK_STATUS_KEY,
			`PR stack feedback: mapping ${stackBranches.branches.length} branches…`,
		);
		const mapped = await mapStackBranchesToPrs(pi, ctx, stackBranches.branches);
		if (mapped.type === "error") {
			notify(ctx, mapped.message, "error");
			return;
		}
		if (mapped.entries.length === 0) {
			notify(ctx, "No open PRs found for the current Graphite stack branches.", "warning");
			return;
		}

		const downloads: StackFeedbackDownload[] = [];
		for (const [index, entry] of mapped.entries.entries()) {
			ctx.ui?.setStatus?.(
				DOWNLOAD_STACK_FEEDBACK_STATUS_KEY,
				`PR stack feedback: downloading ${index + 1}/${mapped.entries.length} (#${entry.pr_number})…`,
			);
			const downloaded = await downloadFeedbackForPr(pi, ctx, entry);
			if (downloaded.type === "error") {
				notify(ctx, downloaded.message, "error");
				return;
			}
			downloads.push(downloaded.value);
		}

		const markdown = buildStackDownloadFeedbackMarkdown(downloads);
		prefillEditor(
			ctx,
			markdown,
			"Downloaded PR stack feedback into the editor. Review/edit, then press Enter.",
		);
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, undefined);
	}
}

async function runPrPreviewFeedbackCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionContext,
): Promise<void> {
	const parsedArgs = parseOptionalPrNumberArgs(rawArgs, "Usage: /pr:preview-feedback [pr-number]");
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}
	if (ctx.hasUI !== true || ctx.ui?.custom === undefined) {
		notify(ctx, "PR feedback preview requires interactive Pi TUI custom UI.", "error");
		return;
	}

	ctx.ui.setStatus?.(PREVIEW_FEEDBACK_STATUS_KEY, "PR feedback preview: loading target…");
	try {
		const download = await loadPreviewFeedbackTarget(pi, ctx, parsedArgs.args);
		if (download.type === "error") {
			notify(ctx, download.message, "error");
			return;
		}
		if (!download.value.found) {
			notify(ctx, missingPreviewTargetMessage(download.value.target), "warning");
			return;
		}
		const prNumber = download.value.target.pr_number;
		if (prNumber === null || prNumber <= 0) {
			notify(ctx, "PR feedback preview could not determine a positive target PR number.", "error");
			return;
		}

		ctx.ui.setStatus?.(
			PREVIEW_FEEDBACK_STATUS_KEY,
			`PR feedback preview: loading #${prNumber} threads…`,
		);
		const threads = await loadPreviewReviewThreads(pi, ctx, prNumber);
		if (threads.type === "error") {
			notify(ctx, threads.message, "error");
			return;
		}

		const model = buildPreviewFeedbackViewModel({
			download: download.value,
			threads: threads.value.review_threads,
		});
		await ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) =>
				new PrPreviewFeedbackView({
					tui,
					theme,
					model,
					onClose: () => done(undefined),
				}),
			{
				overlay: true,
				overlayOptions: { width: "90%", maxHeight: "85%", margin: 1 },
				onHandle: (handle: { focus(): void }) => handle.focus(),
			},
		);
	} finally {
		ctx.ui?.setStatus?.(PREVIEW_FEEDBACK_STATUS_KEY, undefined);
	}
}

type ParsedDownloadFeedbackArgs =
	| { type: "valid"; args: string[] }
	| { type: "invalid"; message: string };

type CommandResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

function parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedDownloadFeedbackArgs {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid", args: [] };
	if (parsed.args.length === 1 && isPositiveIntegerToken(parsed.args[0] ?? ""))
		return { type: "valid", args: ["--pr-number", parsed.args[0] ?? ""] };
	return { type: "invalid", message: usage };
}

function parseNoArgs(
	rawArgs: string,
	usage: string,
): { type: "valid" } | { type: "invalid"; message: string } {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid" };
	return { type: "invalid", message: usage };
}

function isPositiveIntegerToken(value: string): boolean {
	if (!/^\d+$/u.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0;
}

async function loadStackBranches(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<{ type: "ok"; branches: string[] } | { type: "error"; message: string }> {
	const result = await pi.exec("slot", ["gt", "exec", "stack-branches", "--format", "json"], {
		cwd: ctx.cwd,
		timeout: STACK_DISCOVERY_TIMEOUT_MS,
	});
	const parsed = parseEnvelopeWithSchema({
		label: "slot gt exec stack-branches",
		result,
		schema: stackBranchesDataSchema,
		allowFailureData: true,
	});
	if (parsed.type === "error") return parsed;
	return { type: "ok", branches: parsed.value.branches };
}

async function mapStackBranchesToPrs(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	branches: readonly string[],
): Promise<{ type: "ok"; entries: BranchPrEntry[] } | { type: "error"; message: string }> {
	const branchesJson = JSON.stringify({ branches });
	const result = await pi.exec(
		"pr-address",
		["exec", "map-branch-prs", "--branches-json", branchesJson, "--format", "json"],
		{ cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS },
	);
	const parsed = parseEnvelopeWithSchema({
		label: "pr-address map-branch-prs",
		result,
		schema: mapBranchPrsDataSchema,
	});
	if (parsed.type === "error") return parsed;
	return { type: "ok", entries: parsed.value.branch_prs };
}

async function downloadFeedbackForPr(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	entry: BranchPrEntry,
): Promise<CommandResult<StackFeedbackDownload>> {
	const result = await pi.exec(
		"pr-address",
		["exec", "download-feedback", "--pr-number", String(entry.pr_number), "--format", "json"],
		{ cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS },
	);
	const parsed = parseEnvelopeWithSchema({
		label: `pr-address download-feedback #${entry.pr_number}`,
		result,
		schema: stackMarkdownDataSchema,
		allowFailureData: true,
	});
	if (parsed.type === "error") return parsed;
	return {
		type: "ok",
		value: { entry, markdown: parsed.value.markdown, counts: parsed.value.counts },
	};
}

async function loadPreviewFeedbackTarget(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	args: readonly string[],
): Promise<CommandResult<PreviewDownloadFeedbackData>> {
	const result = await pi.exec(
		"pr-address",
		["exec", "download-feedback", ...args, "--format", "json"],
		{
			cwd: ctx.cwd,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return parseEnvelopeWithSchema({
		label: "pr-address download-feedback",
		result,
		schema: previewDownloadFeedbackDataSchema,
		allowFailureData: true,
	});
}

async function loadPreviewReviewThreads(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	prNumber: number,
): Promise<CommandResult<PreviewReviewThreadsData>> {
	const result = await pi.exec(
		"pr-address",
		["exec", "pr-review-threads", "--pr-number", String(prNumber), "--format", "json"],
		{ cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS },
	);
	return parseEnvelopeWithSchema({
		label: `pr-address pr-review-threads #${prNumber}`,
		result,
		schema: previewReviewThreadsDataSchema,
	});
}

function buildPreviewFeedbackViewModel(options: {
	download: PreviewDownloadFeedbackData;
	threads: readonly z.output<typeof previewReviewThreadSchema>[];
}): PrPreviewFeedbackViewModel {
	const prNumber = options.download.target.pr_number;
	if (prNumber === null || prNumber <= 0) {
		throw new Error("preview feedback model requires a positive PR number");
	}
	return {
		target: {
			pr_number: prNumber,
			title: options.download.target.title,
			url: options.download.target.url,
			branch: options.download.target.branch,
			head_ref_name: options.download.target.head_ref_name,
			base_ref_name: options.download.target.base_ref_name,
		} satisfies PrPreviewFeedbackTarget,
		counts: options.download.counts satisfies PrPreviewFeedbackCounts,
		fetchedAt: new Date(),
		threads: options.threads.map(previewThreadFromData),
	};
}

function previewThreadFromData(
	thread: z.output<typeof previewReviewThreadSchema>,
): PrPreviewFeedbackThread {
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_resolved: thread.is_resolved,
		is_outdated: thread.is_outdated,
		comments: thread.comments.map(previewCommentFromData),
	};
}

function previewCommentFromData(
	comment: z.output<typeof previewReviewCommentSchema>,
): PrPreviewFeedbackComment {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.author,
		path: comment.path,
		line: comment.line,
		start_line: comment.start_line,
		created_at: comment.created_at,
	};
}

function missingPreviewTargetMessage(target: PreviewDownloadFeedbackData["target"]): string {
	if (target.pr_number !== null) return `No PR found for PR ${target.pr_number}.`;
	if (target.branch !== null) return `No open PR found for branch ${target.branch}.`;
	return "No open PR found for the current branch.";
}

interface EnvelopeWithSchemaOptions<T> {
	label: string;
	result: ExecResult;
	schema: z.ZodType<T>;
	allowFailureData?: boolean | undefined;
}

function parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T> {
	const parsed = parseMachineEnvelopeData(options.result.stdout, {
		label: options.label,
		stdoutTail: { maxLines: 20, maxChars: 2000 },
	});
	const data = envelopeData(parsed, options);
	if (data.type === "error") return data;

	const schemaResult = options.schema.safeParse(data.value);
	if (!schemaResult.success)
		return { type: "error", message: schemaError(options.label, schemaResult.error) };
	return { type: "ok", value: schemaResult.data };
}

function envelopeData(
	parsed: MachineEnvelopeDataParseResult,
	options: EnvelopeWithSchemaOptions<unknown>,
): CommandResult<Record<string, unknown>> {
	if (parsed.type === "valid") return { type: "ok", value: parsed.data };
	if (options.allowFailureData === true) {
		const failureData = failureEnvelopeData(options.result.stdout);
		if (failureData !== undefined) return { type: "ok", value: failureData };
	}
	return { type: "error", message: envelopeDetail(parsed, options.result) };
}

function failureEnvelopeData(stdout: string): Record<string, unknown> | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || parsed.exit_code !== 1 || !isRecord(parsed.data)) return undefined;
	return parsed.data;
}

function buildStackDownloadFeedbackMarkdown(downloads: readonly StackFeedbackDownload[]): string {
	return [
		"# PR stack feedback triage request",
		"",
		"Downloaded PR feedback for the current Graphite stack is below. Review the summary and instructions at the bottom before responding.",
		"",
		"## Stack PRs",
		...downloads.map(
			({ entry }) => `- #${entry.pr_number} ${entry.branch}: ${entry.title} (${entry.url})`,
		),
		"",
		"## Feedback by PR",
		...downloads.flatMap(({ entry, markdown }) => [
			"",
			`## PR #${entry.pr_number}: ${entry.title}`,
			`- Branch: ${entry.branch}`,
			`- URL: ${entry.url}`,
			"",
			...demoteMarkdownHeadings(stripPrDownloadHeading(markdown)).split("\n"),
		]),
		"",
		...renderStackDownloadFeedbackSummary(downloads),
		"",
		...renderStackInstructions(),
	].join("\n");
}

function renderStackDownloadFeedbackSummary(downloads: readonly StackFeedbackDownload[]): string[] {
	const totals = sumDownloadFeedbackCounts(downloads);
	return [
		"## Summary",
		`Downloaded feedback for ${downloads.length} ${downloads.length === 1 ? "PR" : "PRs"} in the current Graphite stack.`,
		"",
		"Stack PRs:",
		...downloads.map(
			({ entry }) => `- #${entry.pr_number} ${entry.branch}: ${entry.title} (${entry.url})`,
		),
		"",
		"Totals:",
		`- Unresolved review threads included: ${totals.included_review_threads}`,
		`- PR-level review bodies included: ${totals.included_reviews}`,
		`- Discussion comments included: ${totals.included_discussion_comments}`,
		`- Resolved review threads excluded: ${totals.excluded_resolved_threads}`,
		`- Empty PR-level reviews excluded: ${totals.excluded_empty_reviews}`,
		`- Automation-like discussion comments excluded: ${totals.excluded_automation_comments}`,
	];
}

function sumDownloadFeedbackCounts(
	downloads: readonly StackFeedbackDownload[],
): DownloadFeedbackCounts {
	return downloads.reduce<DownloadFeedbackCounts>(
		(totals, download) => ({
			included_review_threads:
				totals.included_review_threads + download.counts.included_review_threads,
			included_reviews: totals.included_reviews + download.counts.included_reviews,
			included_discussion_comments:
				totals.included_discussion_comments + download.counts.included_discussion_comments,
			excluded_resolved_threads:
				totals.excluded_resolved_threads + download.counts.excluded_resolved_threads,
			excluded_empty_reviews:
				totals.excluded_empty_reviews + download.counts.excluded_empty_reviews,
			excluded_automation_comments:
				totals.excluded_automation_comments + download.counts.excluded_automation_comments,
		}),
		{
			included_review_threads: 0,
			included_reviews: 0,
			included_discussion_comments: 0,
			excluded_resolved_threads: 0,
			excluded_empty_reviews: 0,
			excluded_automation_comments: 0,
		},
	);
}

function renderStackInstructions(): string[] {
	return STACK_FEEDBACK_INSTRUCTIONS.split(/\r\n|\r|\n/u);
}

function stripPrDownloadHeading(markdown: string): string {
	return markdown.replace(/^# PR feedback triage request(?:\r\n|\r|\n)+/u, "").trim();
}

function demoteMarkdownHeadings(markdown: string): string {
	return markdown
		.split(/\r\n|\r|\n/u)
		.map((line) => (line.startsWith("#") ? `#${line}` : line))
		.join("\n");
}

function envelopeDetail(parsed: { message: string }, result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr === "" ? parsed.message : `${parsed.message}\n${stderr}`;
}

function schemaError(label: string, error: z.ZodError): string {
	return `${label} returned unexpected data: ${formatZodError(error, { rootPath: null })}`;
}

function prefillEditor(ctx: ExtensionContext, markdown: string, message: string): void {
	if (ctx.ui?.setEditorText === undefined) {
		notify(ctx, "This Pi runtime cannot prefill editor text.", "error");
		return;
	}
	ctx.ui.setEditorText(markdown);
	notify(ctx, message, "info");
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	ctx.ui?.notify?.(message, level);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
