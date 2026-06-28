import { z } from "zod";

import { PrPreviewFeedbackView, type PrPreviewFeedbackViewModel } from "./preview-feedback-view.ts";
import {
	PREVIEW_OVERLAY_MARGIN,
	PREVIEW_OVERLAY_MAX_HEIGHT_RATIO,
} from "./preview-view-utilities.ts";
import type {
	PrPreviewFeedbackComment,
	PrPreviewFeedbackCounts,
	PrPreviewFeedbackTarget,
	PrPreviewFeedbackThread,
} from "./preview-feedback-model.ts";
import type {
	CommandResult,
	EnvelopeWithSchemaOptions,
	ExtensionAPI,
	ExtensionContext,
} from "./extension.ts";

const nullablePreviewStringSchema = z.string().nullable();
const nullablePreviewNumberSchema = z.number().int().nullable();

const previewCountsSchema = z.looseObject({
	included_review_threads: z.number().int().nonnegative(),
	included_reviews: z.number().int().nonnegative(),
	included_discussion_comments: z.number().int().nonnegative(),
	excluded_resolved_threads: z.number().int().nonnegative(),
	excluded_empty_reviews: z.number().int().nonnegative(),
	excluded_automation_comments: z.number().int().nonnegative(),
});

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
	counts: previewCountsSchema,
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

type ParsedPrNumberArgs = { type: "valid"; args: string[] } | { type: "invalid"; message: string };

type PreviewDownloadFeedbackData = z.output<typeof previewDownloadFeedbackDataSchema>;
type PreviewReviewThreadsData = z.output<typeof previewReviewThreadsDataSchema>;

interface PrPreviewFeedbackCommandOptions {
	statusKey: string;
	commandTimeoutMs: number;
	parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedPrNumberArgs;
	parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T>;
	notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void;
}

interface PrPreviewFeedbackCommandRuntime extends PrPreviewFeedbackCommandOptions {
	pi: ExtensionAPI;
}

interface RunPrPreviewFeedbackCommandOptions {
	runtime: PrPreviewFeedbackCommandRuntime;
	rawArgs: string;
	ctx: ExtensionContext;
}

interface LoadPreviewFeedbackTargetOptions {
	runtime: PrPreviewFeedbackCommandRuntime;
	ctx: ExtensionContext;
	args: readonly string[];
}

interface LoadPreviewReviewThreadsOptions {
	runtime: PrPreviewFeedbackCommandRuntime;
	ctx: ExtensionContext;
	prNumber: number;
}

interface ExecPrAddressWithSchemaOptions<T> {
	runtime: PrPreviewFeedbackCommandRuntime;
	ctx: ExtensionContext;
	args: string[];
	label: string;
	schema: z.ZodType<T>;
	allowFailureData?: boolean | undefined;
}

export function createPrPreviewFeedbackCommand(
	pi: ExtensionAPI,
	options: PrPreviewFeedbackCommandOptions,
): {
	description: string;
	handler(args: string, ctx: ExtensionContext): Promise<void>;
} {
	const runtime = { ...options, pi } satisfies PrPreviewFeedbackCommandRuntime;
	return {
		description: "Preview unresolved PR review threads in a read-only modal overlay.",
		handler: async (rawArgs, ctx) => {
			await runPrPreviewFeedbackCommand({ runtime, rawArgs, ctx });
		},
	};
}

async function runPrPreviewFeedbackCommand(
	options: RunPrPreviewFeedbackCommandOptions,
): Promise<void> {
	const { runtime, rawArgs, ctx } = options;
	const parsedArgs = runtime.parseOptionalPrNumberArgs(
		rawArgs,
		"Usage: /pr:preview-feedback [pr-number]",
	);
	if (parsedArgs.type === "invalid") {
		runtime.notify(ctx, parsedArgs.message, "error");
		return;
	}
	if (ctx.hasUI !== true || ctx.ui?.custom === undefined) {
		runtime.notify(ctx, "PR feedback preview requires interactive Pi TUI custom UI.", "error");
		return;
	}

	ctx.ui.setStatus?.(runtime.statusKey, "PR feedback preview: loading target…");
	try {
		const download = await loadPreviewFeedbackTarget({ runtime, ctx, args: parsedArgs.args });
		if (download.type === "error") {
			runtime.notify(ctx, download.message, "error");
			return;
		}
		if (!download.value.found) {
			runtime.notify(ctx, missingPreviewTargetMessage(download.value.target), "warning");
			return;
		}
		const prNumber = download.value.target.pr_number;
		if (prNumber === null || prNumber <= 0) {
			runtime.notify(
				ctx,
				"PR feedback preview could not determine a positive target PR number.",
				"error",
			);
			return;
		}

		ctx.ui.setStatus?.(runtime.statusKey, `PR feedback preview: loading #${prNumber} threads…`);
		const threads = await loadPreviewReviewThreads({ runtime, ctx, prNumber });
		if (threads.type === "error") {
			runtime.notify(ctx, threads.message, "error");
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
				overlayOptions: {
					width: "90%",
					maxHeight: `${Math.round(PREVIEW_OVERLAY_MAX_HEIGHT_RATIO * 100)}%`,
					margin: PREVIEW_OVERLAY_MARGIN,
				},
				onHandle: (handle: { focus(): void }) => handle.focus(),
			},
		);
	} finally {
		ctx.ui?.setStatus?.(runtime.statusKey, undefined);
	}
}

async function loadPreviewFeedbackTarget(
	options: LoadPreviewFeedbackTargetOptions,
): Promise<CommandResult<PreviewDownloadFeedbackData>> {
	return await execPrAddressWithSchema({
		runtime: options.runtime,
		ctx: options.ctx,
		args: ["address", "exec", "download-feedback", ...options.args, "--format", "json"],
		label: "sdl address exec download-feedback",
		schema: previewDownloadFeedbackDataSchema,
		allowFailureData: true,
	});
}

async function loadPreviewReviewThreads(
	options: LoadPreviewReviewThreadsOptions,
): Promise<CommandResult<PreviewReviewThreadsData>> {
	return await execPrAddressWithSchema({
		runtime: options.runtime,
		ctx: options.ctx,
		args: [
			"address",
			"exec",
			"pr-review-threads",
			"--pr-number",
			String(options.prNumber),
			"--format",
			"json",
		],
		label: `sdl address exec pr-review-threads #${options.prNumber}`,
		schema: previewReviewThreadsDataSchema,
	});
}

async function execPrAddressWithSchema<T>(
	options: ExecPrAddressWithSchemaOptions<T>,
): Promise<CommandResult<T>> {
	const result = await options.runtime.pi.exec("sdl", options.args, {
		cwd: options.ctx.cwd,
		timeout: options.runtime.commandTimeoutMs,
	});
	return options.runtime.parseEnvelopeWithSchema({
		label: options.label,
		result,
		schema: options.schema,
		allowFailureData: options.allowFailureData,
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
