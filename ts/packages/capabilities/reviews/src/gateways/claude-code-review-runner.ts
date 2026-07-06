import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { ReviewResult } from "../core/failures.ts";
import {
	createFindingsReview,
	reviewExecutionResponseSchema,
	reviewFindingsPayloadSchema,
	type ReviewExecutionResponse,
	type ReviewFindingsPayload,
	type ReviewInputCoverage,
	type ReviewUsage,
} from "../core/models.ts";

const TRUNCATED_MODEL_RESPONSE_CHARS = 500;

export function buildClaudeDiffFindingsJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(reviewFindingsPayloadSchema, { io: "output" }) as Record<
		string,
		unknown
	>;
	// Claude Code accepts draft schema keywords but omits structured_output when the top-level schema URI is present.
	delete schema.$schema;
	return schema;
}

export function buildClaudeCodeArgs(options: {
	readonly model: string;
	readonly systemPrompt: string;
}): string[] {
	return [
		"-p",
		"--output-format",
		"json",
		"--bare",
		"--tools",
		"Bash,Read",
		"--model",
		options.model,
		"--system-prompt",
		options.systemPrompt,
		"--json-schema",
		JSON.stringify(buildClaudeDiffFindingsJsonSchema()),
	];
}

export function parseClaudeCodeReviewOutput(options: {
	readonly stdout: string;
	readonly inputCoverage: ReviewInputCoverage | null;
}): ReviewResult<ReviewExecutionResponse> {
	if (options.stdout.trim() === "") {
		return resultErr({
			code: "review-execution-empty-output",
			message: "Claude Code produced no JSON output.",
		});
	}

	const parsed = parseClaudeCodeOutputJson(options.stdout);
	if (!parsed.ok) return parsed;

	const resultEvent = resultEventFromParsedOutput(parsed.value);
	if (!resultEvent.ok) return resultEvent;

	if (Object.hasOwn(resultEvent.value, "structured_output")) {
		const findingsResult = reviewFindingsPayloadSchema.safeParse(
			resultEvent.value.structured_output,
		);
		if (!findingsResult.success) {
			return resultErr({
				code: "review-execution-invalid-findings",
				message: `Claude Code structured output did not match the findings schema: ${findingsResult.error.message}`,
			});
		}
		return reviewResponseFromClaudePayload(
			findingsResult.data,
			resultEvent.value,
			options.inputCoverage,
		);
	}

	if (typeof resultEvent.value.result === "string") {
		const prose = truncateModelResponse(resultEvent.value.result);
		return resultErr({
			code: "review-execution-invalid-response",
			message: `Claude Code returned prose instead of structured_output: ${prose}\nConfirm --json-schema is honored by the installed Claude Code binary.`,
		});
	}

	return resultErr({
		code: "review-execution-invalid-response",
		message: "Claude Code result event did not include structured_output.",
	});
}

function resultEventFromParsedOutput(parsed: unknown): ReviewResult<Record<string, unknown>> {
	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (!isRecord(item)) {
				return resultErr({
					code: "review-execution-invalid-response",
					message: "Claude Code event stream contained a non-object event.",
				});
			}
		}
		const resultEvent = parsed.find(
			(item): item is Record<string, unknown> => isRecord(item) && item.type === "result",
		);
		if (resultEvent === undefined) {
			return resultErr({
				code: "review-execution-invalid-response",
				message: "Claude Code event stream did not include a terminal result event.",
			});
		}
		return { ok: true, value: resultEvent };
	}
	if (!isRecord(parsed)) {
		return resultErr({
			code: "review-execution-invalid-response",
			message: "Claude Code output JSON must be an object or event array.",
		});
	}
	return { ok: true, value: parsed };
}

function reviewResponseFromClaudePayload(
	payload: ReviewFindingsPayload,
	resultEvent: Record<string, unknown>,
	inputCoverage: ReviewInputCoverage | null,
): ReviewResult<ReviewExecutionResponse> {
	try {
		const response = reviewExecutionResponseSchema.parse({
			payload: createFindingsReview(payload.findings),
			usage: usageFromResultEvent(resultEvent),
			inputCoverage,
		});
		return { ok: true, value: response };
	} catch (error) {
		return resultErr({
			code: "review-execution-invalid-findings",
			message: `Claude Code structured output did not match the findings schema: ${formatErrorMessage(error)}`,
		});
	}
}

function parseClaudeCodeOutputJson(stdout: string): ReviewResult<unknown> {
	try {
		return { ok: true, value: JSON.parse(stdout) as unknown };
	} catch (error) {
		return resultErr({
			code: "review-execution-invalid-json",
			message: `Claude Code output was not valid JSON: ${formatErrorMessage(error)}`,
		});
	}
}

function usageFromResultEvent(resultEvent: Record<string, unknown>): ReviewUsage | null {
	const usage = resultEvent.usage;
	if (!isRecord(usage)) return null;

	const parsed = {
		inputTokens: usage.input_tokens,
		outputTokens: usage.output_tokens,
		cacheCreationInputTokens: usage.cache_creation_input_tokens,
		cacheReadInputTokens: usage.cache_read_input_tokens,
		totalCostUsd: resultEvent.total_cost_usd,
		durationMs: resultEvent.duration_ms,
		numTurns: resultEvent.num_turns,
	};
	const result = z
		.object({
			inputTokens: z.int().min(0),
			outputTokens: z.int().min(0),
			cacheCreationInputTokens: z.int().min(0),
			cacheReadInputTokens: z.int().min(0),
			totalCostUsd: z.number().min(0),
			durationMs: z.int().min(0),
			numTurns: z.int().min(0),
		})
		.strict()
		.safeParse(parsed);
	return result.success ? result.data : null;
}

function truncateModelResponse(response: string): string {
	return response.length <= TRUNCATED_MODEL_RESPONSE_CHARS
		? response
		: `${response.slice(0, TRUNCATED_MODEL_RESPONSE_CHARS)}…`;
}
