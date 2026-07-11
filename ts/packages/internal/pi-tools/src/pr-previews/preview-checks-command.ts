import type { ExecGateway } from "@nseng-ai/pi/shared/exec-gateway";
import { z } from "zod";

import { PrPreviewChecksView, type PrPreviewCheckLogLoadOptions } from "./preview-checks-view.ts";
import { loadCheckLogs } from "./preview-check-logs.ts";
import {
	aggregatePreviewChecksCounts,
	effectiveBranch,
	sortPreviewChecks,
	type PrPreviewChecksCounts,
	type PrPreviewChecksStackEntry,
	type PrPreviewChecksTarget,
	type PrPreviewChecksViewModel,
} from "./preview-checks-model.ts";
import { missingPreviewTargetMessage } from "./preview-view-utilities.ts";
import { overlayHostOptions } from "../overlay-kit/frame.ts";
import type { CommandResult, EnvelopeWithSchemaOptions, ExtensionContext } from "./extension.ts";
import { execNsJson } from "./exec-ns-json.ts";

const nullablePreviewStringSchema = z.string().nullable();
const nullablePreviewNumberSchema = z.number().int().nullable();
const previewChecksTargetSchema = z.looseObject({
	pr_number: nullablePreviewNumberSchema.optional(),
	title: nullablePreviewStringSchema.optional(),
	url: nullablePreviewStringSchema.optional(),
	branch: nullablePreviewStringSchema.optional(),
	head_ref_name: nullablePreviewStringSchema.optional(),
	base_ref_name: nullablePreviewStringSchema.optional(),
	head_ref_oid: nullablePreviewStringSchema.optional(),
});

const previewChecksCountsSchema = z.looseObject({
	passing: z.number().int().nonnegative(),
	pending: z.number().int().nonnegative(),
	failing: z.number().int().nonnegative(),
	// Default keeps payloads from a pre-cancelled-bucket `ns` CLI parseable.
	cancelled: z.number().int().nonnegative().default(0),
	unknown: z.number().int().nonnegative(),
	hasMore: z.boolean().optional(),
});

const previewCheckSchema = z.looseObject({
	bucket: z.union([
		z.literal("failing"),
		z.literal("pending"),
		z.literal("unknown"),
		z.literal("cancelled"),
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

const stackBranchesDataSchema = z.looseObject({
	branches: z.array(z.string()),
	current: z.string(),
});

const branchPrChecksEntrySchema = z.discriminatedUnion("status", [
	z.looseObject({
		branch: z.string(),
		status: z.literal("found"),
		target: previewChecksTargetSchema,
		counts: previewChecksCountsSchema,
		checks: z.array(previewCheckSchema),
	}),
	z.looseObject({ branch: z.string(), status: z.literal("missing") }),
	z.looseObject({ branch: z.string(), status: z.literal("ambiguous") }),
]);

const branchPrChecksDataSchema = z.looseObject({
	entries: z.array(branchPrChecksEntrySchema),
});

type ParsedPrNumberArgs =
	| { type: "valid"; args: string[]; prNumber?: number }
	| { type: "invalid"; message: string };
type PreviewChecksData = z.output<typeof previewChecksDataSchema>;
type PreviewChecksTargetData = z.output<typeof previewChecksTargetSchema>;
type StackBranchesData = z.output<typeof stackBranchesDataSchema>;
type BranchPrChecksData = z.output<typeof branchPrChecksDataSchema>;

const EMPTY_PREVIEW_TARGET = {
	pr_number: null,
	title: null,
	url: null,
	branch: null,
	head_ref_name: null,
	base_ref_name: null,
	head_ref_oid: null,
} satisfies PrPreviewChecksTarget;

interface PrPreviewChecksCommandOptions {
	statusKey: string;
	commandTimeoutMs: number;
	parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedPrNumberArgs;
	parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T>;
	notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void;
}

interface PrPreviewChecksCommandRuntime extends PrPreviewChecksCommandOptions {
	pi: ExecGateway;
}

interface PrPreviewChecksExecContext {
	runtime: PrPreviewChecksCommandRuntime;
	ctx: ExtensionContext;
}

export function createPrPreviewChecksCommand(
	pi: ExecGateway,
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

async function runPrPreviewChecksCommand(
	options: PrPreviewChecksExecContext & { rawArgs: string },
): Promise<void> {
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
		const modelResult =
			parsedArgs.prNumber === undefined
				? await loadStackPreviewChecksViewModel({ runtime, ctx })
				: await loadSinglePreviewChecksViewModel({
						runtime,
						ctx,
						args: parsedArgs.args,
						knownPrNumber: parsedArgs.prNumber,
					});
		if (modelResult.type === "error") {
			runtime.notify(ctx, modelResult.message, "error");
			return;
		}
		const model = modelResult.value;
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
			overlayHostOptions(),
		);
	} finally {
		ctx.ui?.setStatus?.(runtime.statusKey, undefined);
	}
}

async function loadSinglePreviewChecksViewModel(
	options: PrPreviewChecksExecContext & {
		args: readonly string[];
		knownPrNumber?: number;
	},
): Promise<CommandResult<PrPreviewChecksViewModel>> {
	const data = await execPrChecks(options);
	if (data.type === "error") return data;
	const target = previewTargetFromData(
		data.value.target,
		options.knownPrNumber === undefined ? {} : { pr_number: options.knownPrNumber },
	);
	if (!data.value.found) {
		return {
			type: "error",
			message: missingPreviewTargetMessage(target, { preferredLocator: "branch" }),
		};
	}
	const prNumber = resolvedPrNumberValue(target.pr_number);
	if (prNumber === null) {
		return {
			type: "error",
			message: "PR checks preview could not determine a positive target PR number.",
		};
	}
	return {
		type: "ok",
		value: buildPreviewChecksViewModel(data.value, { ...target, pr_number: prNumber }),
	};
}

async function loadStackPreviewChecksViewModel(
	options: PrPreviewChecksExecContext,
): Promise<CommandResult<PrPreviewChecksViewModel>> {
	const stack = await execStackBranches(options);
	if (stack.type === "error" || stack.value.branches.length === 0) {
		return await fallbackToSinglePreviewChecksViewModel(options);
	}
	const checksResult = await execBranchPrChecks({ ...options, branches: stack.value.branches });
	if (checksResult.type === "error") return await fallbackToSinglePreviewChecksViewModel(options);

	const entriesByBranch = new Map(checksResult.value.entries.map((entry) => [entry.branch, entry]));
	const entries = stack.value.branches.map((branch) => {
		const entry = entriesByBranch.get(branch);
		if (entry === undefined || entry.status !== "found") return unmappedStackEntry(branch);
		return buildPreviewChecksStackEntry(entry, fallbackTargetForUnmappedBranch(branch));
	});
	if (entries.length === 0) return await fallbackToSinglePreviewChecksViewModel(options);
	return { type: "ok", value: buildStackPreviewChecksViewModel(stack.value, entries) };
}

async function fallbackToSinglePreviewChecksViewModel(
	options: PrPreviewChecksExecContext,
): Promise<CommandResult<PrPreviewChecksViewModel>> {
	return await loadSinglePreviewChecksViewModel({ ...options, args: [] });
}

async function execPrChecks(
	options: PrPreviewChecksExecContext & { args: readonly string[] },
): Promise<CommandResult<PreviewChecksData>> {
	return await execNsJson({
		runtime: options.runtime,
		ctx: options.ctx,
		args: ["address", "exec", "pr-checks", ...options.args, "--format", "json"],
		label: "ns address exec pr-checks",
		schema: previewChecksDataSchema,
	});
}

async function execStackBranches(
	options: PrPreviewChecksExecContext,
): Promise<CommandResult<StackBranchesData>> {
	return await execNsJson({
		runtime: options.runtime,
		ctx: options.ctx,
		args: ["slot", "gt", "exec", "stack-branches", "--format", "json"],
		label: "ns slot gt exec stack-branches",
		schema: stackBranchesDataSchema,
		allowFailureData: true,
	});
}

async function execBranchPrChecks(
	options: PrPreviewChecksExecContext & { branches: readonly string[] },
): Promise<CommandResult<BranchPrChecksData>> {
	return await execNsJson({
		runtime: options.runtime,
		ctx: options.ctx,
		args: [
			"address",
			"exec",
			"branch-pr-checks",
			"--branches-json",
			JSON.stringify({ branches: options.branches }),
			"--format",
			"json",
		],
		label: "ns address exec branch-pr-checks",
		schema: branchPrChecksDataSchema,
		allowFailureData: true,
	});
}

function buildPreviewChecksViewModel(
	data: PreviewChecksData,
	target: PrPreviewChecksTarget,
): PrPreviewChecksViewModel {
	const entry = buildPreviewChecksStackEntry(data, fallbackTargetFromPreviewData(data, target));
	return {
		target: entry.target,
		counts: entry.counts,
		fetchedAt: new Date(),
		checks: entry.checks,
	};
}

function buildStackPreviewChecksViewModel(
	stack: StackBranchesData,
	entries: readonly PrPreviewChecksStackEntry[],
): PrPreviewChecksViewModel {
	const currentEntry =
		entries.find((entry) => effectiveBranch(entry.target) === stack.current) ??
		entries[0] ??
		unmappedStackEntry(stack.current);
	const counts = aggregatePreviewChecksCounts(entries);
	return {
		target: currentEntry.target,
		counts,
		fetchedAt: new Date(),
		checks: entries.flatMap((entry) => [...entry.checks]),
		stack: entries,
	};
}

function buildPreviewChecksStackEntry(
	data: Pick<PreviewChecksData, "target" | "counts" | "checks">,
	fallback: PrPreviewChecksTarget,
): PrPreviewChecksStackEntry {
	return {
		target: previewTargetFromData(data.target, fallback),
		counts: checksCounts(data),
		checks: sortPreviewChecks(data.checks),
	};
}

function unmappedStackEntry(branch: string): PrPreviewChecksStackEntry {
	return {
		target: fallbackTargetForUnmappedBranch(branch),
		counts: { passing: 0, pending: 0, failing: 0, cancelled: 0, unknown: 0 },
		checks: [],
	};
}

function fallbackTargetFromPreviewData(
	data: PreviewChecksData,
	target: PrPreviewChecksTarget,
): PrPreviewChecksTarget {
	const branch = effectiveBranch(target) ?? "";
	return previewTargetFromData(
		{ ...target, branch },
		{
			...(target.pr_number === null ? {} : { pr_number: target.pr_number }),
			title: "(untitled)",
			url: "",
			branch,
			head_ref_name: branch,
			base_ref_name: data.target.base_ref_name ?? "",
		},
	);
}

function fallbackTargetForUnmappedBranch(branch: string): PrPreviewChecksTarget {
	return previewTargetFromData({
		title: "(no open PR mapped)",
		branch,
		head_ref_name: branch,
	});
}

function previewTargetFromData(
	target: Partial<PrPreviewChecksTarget> | PreviewChecksTargetData,
	fallback: Partial<PrPreviewChecksTarget> = {},
): PrPreviewChecksTarget {
	const withFallbacks: PrPreviewChecksTarget = { ...EMPTY_PREVIEW_TARGET };
	Object.assign(withFallbacks, presentEntries(fallback), presentEntries(target));
	return withFallbacks;
}

function presentEntries<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(
			([, entryValue]) => entryValue !== undefined && entryValue !== null,
		),
	) as Partial<T>;
}

function checksCounts(data: Pick<PreviewChecksData, "counts">): PrPreviewChecksCounts {
	return {
		passing: data.counts.passing,
		pending: data.counts.pending,
		failing: data.counts.failing,
		cancelled: data.counts.cancelled,
		unknown: data.counts.unknown,
		...(data.counts.hasMore === undefined ? {} : { hasMore: data.counts.hasMore }),
	};
}

function resolvedPrNumberValue(prNumber: number | null): number | null {
	return prNumber === null || prNumber <= 0 ? null : prNumber;
}
