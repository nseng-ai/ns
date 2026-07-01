import { z } from "zod";

import {
	PrPreviewChecksView,
	type PrPreviewCheckLogLoadOptions,
	type PrPreviewChecksViewModel,
} from "./preview-checks-view.ts";
import { loadCheckLogs } from "./preview-check-logs.ts";
import { sortPreviewChecks, type PrPreviewChecksCounts } from "./preview-checks-model.ts";
import {
	missingPreviewTargetMessage,
	PREVIEW_OVERLAY_MARGIN,
	PREVIEW_OVERLAY_MAX_HEIGHT_RATIO,
} from "./preview-view-utilities.ts";
import type {
	CommandResult,
	EnvelopeWithSchemaOptions,
	ExtensionAPI,
	ExtensionContext,
} from "./extension.ts";

const nullablePreviewStringSchema = z.string().nullable();
const nullablePreviewNumberSchema = z.number().int().nullable();
const previewChecksTargetSchema = z.looseObject({
	pr_number: nullablePreviewNumberSchema,
	title: nullablePreviewStringSchema,
	url: nullablePreviewStringSchema,
	branch: nullablePreviewStringSchema,
	head_ref_name: nullablePreviewStringSchema,
	base_ref_name: nullablePreviewStringSchema,
	head_ref_oid: nullablePreviewStringSchema,
});

const previewChecksCountsSchema = z.looseObject({
	passing: z.number().int().nonnegative(),
	pending: z.number().int().nonnegative(),
	failing: z.number().int().nonnegative(),
	unknown: z.number().int().nonnegative(),
	hasMore: z.boolean().optional(),
});

const previewCheckSchema = z.looseObject({
	bucket: z.union([
		z.literal("failing"),
		z.literal("pending"),
		z.literal("unknown"),
		z.literal("passing"),
	]),
	kind: z.union([z.literal("check_run"), z.literal("status_context"), z.literal("unknown")]),
	name: z.string(),
	workflow_name: nullablePreviewStringSchema,
	status: nullablePreviewStringSchema,
	conclusion: nullablePreviewStringSchema,
	state: nullablePreviewStringSchema,
	started_at: nullablePreviewStringSchema,
	completed_at: nullablePreviewStringSchema,
	created_at: nullablePreviewStringSchema,
	details_url: nullablePreviewStringSchema,
	target_url: nullablePreviewStringSchema,
	identity: nullablePreviewStringSchema,
});

const previewChecksDataSchema = z.looseObject({
	found: z.boolean(),
	target: previewChecksTargetSchema,
	counts: previewChecksCountsSchema,
	checks: z.array(previewCheckSchema),
});

type ParsedPrNumberArgs = { type: "valid"; args: string[] } | { type: "invalid"; message: string };
type PreviewChecksData = z.output<typeof previewChecksDataSchema>;

interface PrPreviewChecksCommandOptions {
	statusKey: string;
	commandTimeoutMs: number;
	parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedPrNumberArgs;
	parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T>;
	notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void;
}

interface PrPreviewChecksCommandRuntime extends PrPreviewChecksCommandOptions {
	pi: ExtensionAPI;
}

export function createPrPreviewChecksCommand(
	pi: ExtensionAPI,
	options: PrPreviewChecksCommandOptions,
): { description: string; handler(args: string, ctx: ExtensionContext): Promise<void> } {
	const runtime = { ...options, pi } satisfies PrPreviewChecksCommandRuntime;
	return {
		description: "Preview GitHub PR checks in a read-only modal overlay.",
		handler: async (rawArgs, ctx) => {
			await runPrPreviewChecksCommand({ runtime, rawArgs, ctx });
		},
	};
}

async function runPrPreviewChecksCommand(options: {
	runtime: PrPreviewChecksCommandRuntime;
	rawArgs: string;
	ctx: ExtensionContext;
}): Promise<void> {
	const { runtime, rawArgs, ctx } = options;
	const parsedArgs = runtime.parseOptionalPrNumberArgs(
		rawArgs,
		"Usage: /pr:preview-checks [pr-number]",
	);
	if (parsedArgs.type === "invalid") {
		runtime.notify(ctx, parsedArgs.message, "error");
		return;
	}
	if (ctx.hasUI !== true || ctx.ui?.custom === undefined) {
		runtime.notify(ctx, "PR checks preview requires interactive Pi TUI custom UI.", "error");
		return;
	}

	ctx.ui.setStatus?.(runtime.statusKey, "PR checks preview: loading…");
	try {
		const data = await execPrChecks({ runtime, ctx, args: parsedArgs.args });
		if (data.type === "error") {
			runtime.notify(ctx, data.message, "error");
			return;
		}
		if (!data.value.found) {
			runtime.notify(
				ctx,
				missingPreviewTargetMessage(data.value.target, { preferredLocator: "branch" }),
				"warning",
			);
			return;
		}
		const prNumber = data.value.target.pr_number;
		if (prNumber === null || prNumber <= 0) {
			runtime.notify(
				ctx,
				"PR checks preview could not determine a positive target PR number.",
				"error",
			);
			return;
		}
		const model = buildPreviewChecksViewModel(data.value, prNumber);
		await ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) =>
				new PrPreviewChecksView({
					tui,
					theme,
					model,
					onClose: () => done(undefined),
					onLoadLogs: async (check, loadOptions: PrPreviewCheckLogLoadOptions) =>
						await loadCheckLogs({ runtime, ctx, check, signal: loadOptions.signal }),
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

async function execPrChecks(options: {
	runtime: PrPreviewChecksCommandRuntime;
	ctx: ExtensionContext;
	args: readonly string[];
}): Promise<CommandResult<PreviewChecksData>> {
	const result = await options.runtime.pi.exec(
		"sdl",
		["address", "exec", "pr-checks", ...options.args, "--format", "json"],
		{
			cwd: options.ctx.cwd,
			timeout: options.runtime.commandTimeoutMs,
		},
	);
	return options.runtime.parseEnvelopeWithSchema({
		label: "sdl address exec pr-checks",
		result,
		schema: previewChecksDataSchema,
	});
}

function buildPreviewChecksViewModel(
	data: PreviewChecksData,
	prNumber: number,
): PrPreviewChecksViewModel {
	const counts: PrPreviewChecksCounts = {
		passing: data.counts.passing,
		pending: data.counts.pending,
		failing: data.counts.failing,
		unknown: data.counts.unknown,
		...(data.counts.hasMore === undefined ? {} : { hasMore: data.counts.hasMore }),
	};
	return {
		target: { ...data.target, pr_number: prNumber },
		counts,
		fetchedAt: new Date(),
		checks: sortPreviewChecks(data.checks),
	};
}
