import { formatErrorMessage, optionalEntries } from "@nseng-ai/foundation/primitives";
import type { ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import { agentConfigurationErrorText } from "../agent-configuration.ts";
import { resultDiagnostic, type RunnerSubagentResult } from "../runner-subagents/index.ts";
import {
	EXPLORE_DIRECT_RESULT_PER_TASK_CAP_CHARS,
	EXPLORE_DIRECT_RESULT_TOTAL_CAP_CHARS,
	EXPLORE_TOOL_NAME,
	EXPLORER_AGENT_REPO_RELATIVE_PATH,
} from "./contract.ts";
import type {
	ExploreRequest,
	ExploreTaskDetails,
	ExploreTaskOutcome,
	ExploreToolDetails,
	ExploreToolStatus,
} from "./types.ts";

export function exploreToolResult(
	request: ExploreRequest,
	outcomes: readonly ExploreTaskOutcome[],
): ToolResult<ExploreToolDetails> {
	const taskResults = outcomes.map((outcome) => taskDetails(outcome, request.input.tasks.length));
	const producedFinalTextCount = countFinalTextTaskResults(taskResults);
	const status = summarizeExploreToolStatus(outcomes, producedFinalTextCount);
	const details: ExploreToolDetails = {
		status,
		breadth: request.input.breadth,
		taskCount: request.input.tasks.length,
		maxConcurrency: request.profile.maxConcurrency,
		wallClockMs: request.profile.wallClockMs,
		tasks: taskResults.map((result) => result.detail),
	};
	return {
		content: [{ type: "text", text: formatExploreResultText(details, taskResults) }],
		details,
		...(details.status === "failed" || details.status === "cancelled" ? { isError: true } : {}),
	};
}

function countFinalTextTaskResults(taskResults: readonly ExploreFormattedTaskResult[]): number {
	return taskResults.filter((task) => task.finalTextExcerpt !== undefined).length;
}

function summarizeExploreToolStatus(
	outcomes: readonly ExploreTaskOutcome[],
	producedFinalTextCount: number,
): ExploreToolStatus {
	if (producedFinalTextCount === outcomes.length) return "completed";
	if (producedFinalTextCount > 0) return "partial";
	if (outcomes.some((outcome) => outcome.result.status === "cancelled")) return "cancelled";
	return "failed";
}

interface ExploreFormattedTaskResult {
	detail: ExploreTaskDetails;
	finalTextExcerpt?: TruncatedExploreText;
}

function taskDetails(outcome: ExploreTaskOutcome, taskCount: number): ExploreFormattedTaskResult {
	const result = outcome.result;
	const diagnostic = resultDiagnostic(result);
	const finalTextExcerpt =
		result.status === "final-text"
			? truncateExploreDirectResultText(result.finalText, taskCount)
			: undefined;
	return {
		detail: {
			index: outcome.index,
			title: outcome.title,
			status: result.status,
			elapsedMs: result.elapsedMs,
			...optionalEntries({
				sessionFile: sessionFileFor(result),
				launchPlan: outcome.launchPlan,
				failover: outcome.failover,
				usage: result.usage,
				diagnostic,
			}),
			...(finalTextExcerpt === undefined
				? {}
				: {
						finalTextChars: finalTextExcerpt.originalChars,
						isFinalTextTruncated: finalTextExcerpt.truncated,
					}),
		},
		...optionalEntries({ finalTextExcerpt }),
	};
}

export function configurationErrorResult(
	request: ExploreRequest,
	diagnostic: string,
): ToolResult<ExploreToolDetails> {
	return {
		content: [
			{
				type: "text",
				text: agentConfigurationErrorText({
					toolName: EXPLORE_TOOL_NAME,
					agentKind: "explorer",
					requiredFilePath: EXPLORER_AGENT_REPO_RELATIVE_PATH,
					diagnostic,
				}),
			},
		],
		details: {
			status: "configuration-error",
			breadth: request.input.breadth,
			taskCount: request.input.tasks.length,
			maxConcurrency: request.profile.maxConcurrency,
			wallClockMs: request.profile.wallClockMs,
			tasks: request.input.tasks.map((task, index) => ({
				index,
				title: task.title,
				status: "configuration-error",
				diagnostic,
			})),
		},
		isError: true,
	};
}

function formatExploreResultText(
	details: ExploreToolDetails,
	taskResults: readonly ExploreFormattedTaskResult[],
): string {
	const producedFinalTextCount = countFinalTextTaskResults(taskResults);
	const lines = [
		`explore result: ${producedFinalTextCount}/${details.taskCount} scouts produced final text (breadth: ${details.breadth}, concurrency: ${details.maxConcurrency})`,
	];
	for (const taskResult of taskResults) {
		const detail = taskResult.detail;
		const excerpt = taskResult.finalTextExcerpt;
		lines.push("", `### ${detail.index + 1}. ${detail.title} — ${detail.status}`);
		lines.push(`Session: ${detail.sessionFile ?? "unavailable"}`);
		if (excerpt !== undefined) {
			lines.push("", excerpt.text);
			if (excerpt.truncated) {
				lines.push(
					"",
					`[Scout findings truncated to ${excerpt.text.length} of ${excerpt.originalChars} characters for parent-context size. Full raw child output is available in the child Pi session file above.]`,
				);
			}
		} else if (detail.diagnostic !== undefined) {
			lines.push(`Diagnostic: ${detail.diagnostic}`);
		}
	}
	if (details.status === "failed" || details.status === "cancelled") {
		lines.push(
			"",
			"No explorer scout produced usable final text. Inspect diagnostics/session files before relying on this result.",
		);
	}
	return lines.join("\n");
}

interface TruncatedExploreText {
	text: string;
	truncated: boolean;
	originalChars: number;
}

function truncateExploreDirectResultText(text: string, taskCount: number): TruncatedExploreText {
	const originalChars = text.length;
	const perTaskBudget = Math.min(
		EXPLORE_DIRECT_RESULT_PER_TASK_CAP_CHARS,
		Math.floor(EXPLORE_DIRECT_RESULT_TOTAL_CAP_CHARS / taskCount),
	);
	// Direct explore output uses a hard cap with no marker because the formatter emits
	// the truncation notice separately below each scout section.
	const truncatedText = text.slice(0, perTaskBudget);
	return { text: truncatedText, truncated: truncatedText.length < originalChars, originalChars };
}

export function sessionFileFor(result: RunnerSubagentResult): string | undefined {
	return result.sessionFile ?? result.progress.sessionFile;
}

export function cancelledResult(
	title: string,
	signal: AbortSignal,
	fallback = "Explore task was cancelled.",
): RunnerSubagentResult {
	const diagnostic = abortReasonDiagnostic(signal, fallback);
	return {
		status: "cancelled",
		title,
		diagnostic,
		...optionalEntries({ reason: abortReasonText(signal) }),
		elapsedMs: 0,
		progress: stoppedProgress(title),
	};
}

export function errorResult(title: string, diagnostic: string): RunnerSubagentResult {
	return {
		status: "error",
		title,
		diagnostic,
		error: { message: diagnostic },
		elapsedMs: 0,
		progress: stoppedProgress(title),
	};
}

function stoppedProgress(title: string): RunnerSubagentResult["progress"] {
	return { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 };
}

export function abortReasonDiagnostic(signal: AbortSignal, fallback: string): string {
	const reason = abortReasonText(signal);
	return reason === undefined ? fallback : reason;
}

function abortReasonText(signal: AbortSignal): string | undefined {
	if (!signal.aborted) return undefined;
	const reason = signal.reason;
	if (reason === undefined) return undefined;
	if (typeof reason === "string") return reason;
	return formatErrorMessage(reason);
}
