import { DEFAULT_FAST_MODEL } from "@ns/core/model-slug";
import { optionalEntry } from "@ns/core/primitives";

import { callPiModelText } from "@ns/pi/models/call";
import { loadGhCommand } from "@ns/pi/shared/gh-command";
import { splitTextLines } from "@ns/pi/shared/text-lines";
import type { ExtensionAPI, ExtensionContext } from "./extension.ts";
import type { PrPreviewCheck } from "./preview-checks-model.ts";

const MAX_LOG_SUMMARY_INPUT_CHARS = 80_000;
const LOG_SUMMARY_MAX_TOKENS = 900;

interface PrPreviewCheckLogRuntime {
	pi: ExtensionAPI;
	commandTimeoutMs: number;
}

export interface LoadCheckLogsOptions {
	runtime: PrPreviewCheckLogRuntime;
	ctx: ExtensionContext;
	check: PrPreviewCheck;
	signal?: AbortSignal;
}

export async function loadCheckLogs(options: LoadCheckLogsOptions): Promise<string[]> {
	if (isIncompleteCheck(options.check)) {
		return [
			"Logs are not available yet because this check is still running.",
			"",
			`Status: ${options.check.status ?? options.check.state ?? "pending"}`,
			"Refresh after the check completes, then press l again to summarize logs.",
		];
	}
	const unavailableReason = checkLogUnavailableReason(options.check);
	if (unavailableReason !== null) return unavailableReason;
	const args = githubActionsJobLogArgs(options.check.details_url ?? options.check.target_url);
	if (args === null) return ["No GitHub Actions job log URL is available for this check."];
	const logResult = await loadGhTextCommand({
		runtime: options.runtime,
		ctx: options.ctx,
		args,
		failureLabel: `Failed to load logs with gh ${args.join(" ")}`,
		...optionalEntry("signal", options.signal),
	});
	throwIfSignalAborted(options.signal);
	if (logResult.type === "failed") return logResult.lines;
	if (logResult.output === "") return ["GitHub returned an empty log for this check."];
	return await summarizeCheckLogs({
		ctx: options.ctx,
		check: options.check,
		output: logResult.output,
		...optionalEntry("signal", options.signal),
	});
}

type GhTextCommandResult = { type: "loaded"; output: string } | { type: "failed"; lines: string[] };

async function loadGhTextCommand(options: {
	runtime: PrPreviewCheckLogRuntime;
	ctx: ExtensionContext;
	args: string[];
	failureLabel: string;
	signal?: AbortSignal;
}): Promise<GhTextCommandResult> {
	const result = await loadGhCommand({
		pi: options.runtime.pi,
		args: options.args,
		cwd: options.ctx.cwd,
		timeoutMs: options.runtime.commandTimeoutMs,
		...optionalEntry("signal", options.signal),
	});
	throwIfSignalAborted(options.signal);
	if (result.type === "failed") {
		return { type: "failed", lines: [`${options.failureLabel}:`, ...splitLogLines(result.detail)] };
	}
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	const output = stdout === "" ? stderr : stdout;
	return { type: "loaded", output };
}

async function summarizeCheckLogs(options: {
	ctx: ExtensionContext;
	check: PrPreviewCheck;
	output: string;
	signal?: AbortSignal;
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
		...optionalEntry("signal", options.signal),
	});
	throwIfSignalAborted(options.signal);
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

function throwIfSignalAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason ?? new Error("Operation aborted.");
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
	return splitTextLines(output).map((line) => line.replaceAll("\t", "  "));
}

export function isIncompleteCheck(check: PrPreviewCheck): boolean {
	const state = check.status ?? check.state;
	if (state === null) return check.bucket === "pending";
	return /^(queued|pending|in_progress|requested|waiting)$/iu.test(state);
}

export function checkLogUnavailableReason(check: PrPreviewCheck): string[] | null {
	const conclusion = check.conclusion?.toLowerCase();
	if (conclusion !== "canceled" && conclusion !== "cancelled" && conclusion !== "skipped") {
		return null;
	}
	const label = conclusion === "skipped" ? "skipped" : "canceled";
	return [
		`Logs are not available because this check was ${label}.`,
		"",
		`Check: ${check.workflow_name ?? "(no workflow)"} / ${check.name}`,
		`Conclusion: ${check.conclusion ?? label}`,
		"GitHub can omit job logs for checks that never ran or were canceled before log upload.",
	];
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
