import { DEFAULT_FAST_MODEL } from "@sdl/core/model-slug";
import { z } from "zod";

import { callPiModelText } from "./pi-model-call.ts";
import { PrPreviewChecksView, type PrPreviewChecksViewModel } from "./pr-preview-checks-view.ts";
import { sortPreviewChecks, type PrPreviewCheck } from "./pr-preview-checks-model.ts";
import type {
	CommandResult,
	EnvelopeWithSchemaOptions,
	ExtensionAPI,
	ExtensionContext,
} from "./pr.ts";

const nullablePreviewStringSchema = z.string().nullable();
const nullablePreviewNumberSchema = z.number().int().nullable();
const MAX_LOG_SUMMARY_INPUT_CHARS = 80_000;
const LOG_SUMMARY_MAX_TOKENS = 900;

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
	has_more: z.boolean().optional(),
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
			runtime.notify(ctx, missingPreviewTargetMessage(data.value.target), "warning");
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
					onLoadLogs: async (check) => await loadCheckLogs({ runtime, ctx, check }),
				}),
			{
				overlay: true,
				overlayOptions: { width: "90%", maxHeight: "85%", margin: 1 },
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
		"pr-address",
		["exec", "pr-checks", ...options.args, "--format", "json"],
		{
			cwd: options.ctx.cwd,
			timeout: options.runtime.commandTimeoutMs,
		},
	);
	return options.runtime.parseEnvelopeWithSchema({
		label: "pr-address pr-checks",
		result,
		schema: previewChecksDataSchema,
	});
}

async function loadCheckLogs(options: {
	runtime: PrPreviewChecksCommandRuntime;
	ctx: ExtensionContext;
	check: PrPreviewCheck;
}): Promise<string[]> {
	if (isIncompleteCheck(options.check)) {
		return [
			"Logs are not available yet because this check is still running.",
			"",
			`Status: ${options.check.status ?? options.check.state ?? "pending"}`,
			"Refresh after the check completes, then press l again to summarize logs.",
		];
	}
	const args = githubActionsJobLogArgs(options.check.details_url ?? options.check.target_url);
	if (args === null) return ["No GitHub Actions job log URL is available for this check."];
	const logResult = await loadGhTextCommand({
		runtime: options.runtime,
		ctx: options.ctx,
		args,
		failureLabel: `Failed to load logs with gh ${args.join(" ")}`,
	});
	if (logResult.type === "failed") return logResult.lines;
	if (logResult.output === "") return ["GitHub returned an empty log for this check."];
	return await summarizeCheckLogs({
		ctx: options.ctx,
		check: options.check,
		output: logResult.output,
	});
}

type GhTextCommandResult = { type: "loaded"; output: string } | { type: "failed"; lines: string[] };

async function loadGhTextCommand(options: {
	runtime: PrPreviewChecksCommandRuntime;
	ctx: ExtensionContext;
	args: string[];
	failureLabel: string;
}): Promise<GhTextCommandResult> {
	const result = await options.runtime.pi.exec("gh", options.args, {
		cwd: options.ctx.cwd,
		timeout: options.runtime.commandTimeoutMs,
	});
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	const output = stdout === "" ? stderr : stdout;
	if (result.killed) {
		return { type: "failed", lines: [`${options.failureLabel}:`, "command timed out"] };
	}
	if (result.code !== 0) {
		const lines = output === "" ? [`exit code ${result.code}`] : splitLogLines(output);
		return { type: "failed", lines: [`${options.failureLabel}:`, ...lines] };
	}
	return { type: "loaded", output };
}

async function summarizeCheckLogs(options: {
	ctx: ExtensionContext;
	check: PrPreviewCheck;
	output: string;
}): Promise<string[]> {
	if (options.ctx.modelRegistry === undefined) {
		return [
			"Log summary unavailable: Pi model registry is not available.",
			"",
			...splitLogLines(options.output),
		];
	}
	const result = await callPiModelText({
		registry: options.ctx.modelRegistry,
		provider: DEFAULT_FAST_MODEL.provider,
		modelId: DEFAULT_FAST_MODEL.modelId,
		systemPrompt: LOG_SUMMARY_SYSTEM_PROMPT,
		userText: buildLogSummaryPrompt(options.check, options.output),
		maxTokens: LOG_SUMMARY_MAX_TOKENS,
		reasoning: "minimal",
		timeoutMs: 120_000,
	});
	if (!result.ok) {
		return [
			`Log summary unavailable (${result.reason}${result.message === null ? "" : `: ${result.message}`}).`,
			"",
			...splitLogLines(options.output),
		];
	}
	const summary = result.text.trim();
	if (summary === "") return ["Log summary unavailable: model returned an empty summary."];
	return splitLogLines(summary);
}

const LOG_SUMMARY_SYSTEM_PROMPT = `You summarize GitHub Actions job logs for a coding agent.
Prioritize actionable diagnosis over completeness.
If there are errors, surface exact error messages, nearby command/file/path context, failing step names, and likely next fix.
If no clear error exists, say what the log shows and what to inspect next.
Do not include generic CI advice. Keep it concise and structured.`;

function buildLogSummaryPrompt(check: PrPreviewCheck, output: string): string {
	const normalized = output.slice(Math.max(0, output.length - MAX_LOG_SUMMARY_INPUT_CHARS));
	const truncationNote =
		output.length > normalized.length ? "Only the tail of the log is included.\n" : "";
	return [
		`Check: ${check.workflow_name ?? "(no workflow)"} / ${check.name}`,
		`Status: ${check.status ?? "?"}`,
		`Conclusion: ${check.conclusion ?? "?"}`,
		truncationNote,
		"Log:",
		normalized,
	].join("\n");
}

export function splitLogLines(output: string): string[] {
	return output.split(/\r\n|\r|\n/u).map((line) => line.replaceAll("\t", "  "));
}

export function isIncompleteCheck(check: PrPreviewCheck): boolean {
	const state = check.status ?? check.state;
	if (state === null) return check.bucket === "pending";
	return /^(queued|pending|in_progress|requested|waiting)$/iu.test(state);
}

export function githubActionsJobLogArgs(url: string | null): string[] | null {
	if (url === null) return null;
	const parsed =
		/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(\d+)\/job\/(\d+)(?:\b|[/?#])/u.exec(url);
	if (parsed === null) return null;
	const runId = parsed[1];
	const jobId = parsed[2];
	if (runId === undefined || jobId === undefined) return null;
	return ["run", "view", runId, "--job", jobId, "--log"];
}

function buildPreviewChecksViewModel(
	data: PreviewChecksData,
	prNumber: number,
): PrPreviewChecksViewModel {
	return {
		target: { ...data.target, pr_number: prNumber },
		counts: data.counts,
		fetchedAt: new Date(),
		checks: sortPreviewChecks(data.checks),
	};
}

function missingPreviewTargetMessage(target: PreviewChecksData["target"]): string {
	if (target.branch !== null) return `No open PR found for branch ${target.branch}.`;
	if (target.pr_number !== null) return `No PR found for PR ${target.pr_number}.`;
	return "No open PR found for current branch.";
}
