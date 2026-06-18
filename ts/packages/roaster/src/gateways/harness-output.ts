import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { z } from "zod";

import type { RoasterResult } from "../failures.ts";
import {
	createFindingsReview,
	reviewExecutionResponseSchema,
	severityValues,
	type ReviewExecutionResponse,
	type ReviewFinding,
	type ReviewInputCoverage,
	type ReviewUsage,
} from "../models.ts";

const TRUNCATED_MODEL_RESPONSE_CHARS = 500;

const claudeFindingSchema = z
	.object({
		path: z.string().trim().min(1),
		line: z.int().positive().nullable(),
		severity: z.enum(severityValues),
		summary: z.string().trim().min(1),
		details: z.string().trim().min(1),
	})
	.strict();
const claudeFindingsPayloadSchema = z
	.object({
		findings: z.array(claudeFindingSchema),
	})
	.strict();

type ClaudeFindingsPayload = z.infer<typeof claudeFindingsPayloadSchema>;

export function buildClaudeDiffFindingsJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(claudeFindingsPayloadSchema, { io: "output" }) as Record<
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
}): RoasterResult<ReviewExecutionResponse> {
	if (options.stdout.trim() === "") {
		return harnessOutputError({
			type: "review_execution_empty_output",
			message: "Claude Code produced no JSON output.",
		});
	}

	const parsed = parseClaudeCodeOutputJson(options.stdout);
	if (parsed.type === "error") return parsed;

	const resultEvent = resultEventFromParsedOutput(parsed.value);
	if (resultEvent.type === "error") return resultEvent;

	if (Object.hasOwn(resultEvent.value, "structured_output")) {
		const findingsResult = claudeFindingsPayloadSchema.safeParse(
			resultEvent.value.structured_output,
		);
		if (!findingsResult.success) {
			return harnessOutputError({
				type: "review_execution_invalid_findings",
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
		return harnessOutputError({
			type: "review_execution_invalid_response",
			message: `Claude Code returned prose instead of structured_output: ${prose}\nConfirm --json-schema is honored by the installed Claude Code binary.`,
		});
	}

	return harnessOutputError({
		type: "review_execution_invalid_response",
		message: "Claude Code result event did not include structured_output.",
	});
}

function resultEventFromParsedOutput(parsed: unknown): RoasterResult<Record<string, unknown>> {
	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (!isRecord(item)) {
				return harnessOutputError({
					type: "review_execution_invalid_response",
					message: "Claude Code event stream contained a non-object event.",
				});
			}
		}
		const resultEvent = parsed.find(
			(item): item is Record<string, unknown> => isRecord(item) && item.type === "result",
		);
		if (resultEvent === undefined) {
			return harnessOutputError({
				type: "review_execution_invalid_response",
				message: "Claude Code event stream did not include a terminal result event.",
			});
		}
		return { type: "ok", value: resultEvent };
	}
	if (!isRecord(parsed)) {
		return harnessOutputError({
			type: "review_execution_invalid_response",
			message: "Claude Code output JSON must be an object or event array.",
		});
	}
	return { type: "ok", value: parsed };
}

function reviewResponseFromClaudePayload(
	payload: ClaudeFindingsPayload,
	resultEvent: Record<string, unknown>,
	inputCoverage: ReviewInputCoverage | null,
): RoasterResult<ReviewExecutionResponse> {
	const findings: ReviewFinding[] = payload.findings.map((finding) => ({ ...finding }));
	try {
		const response = reviewExecutionResponseSchema.parse({
			payload: createFindingsReview(findings),
			usage: usageFromResultEvent(resultEvent),
			inputCoverage,
		});
		return { type: "ok", value: response };
	} catch (error) {
		return harnessOutputError({
			type: "review_execution_invalid_findings",
			message: `Claude Code structured output did not match the findings schema: ${formatErrorMessage(error)}`,
		});
	}
}

function parseClaudeCodeOutputJson(stdout: string): RoasterResult<unknown> {
	try {
		return { type: "ok", value: JSON.parse(stdout) as unknown };
	} catch (error) {
		return harnessOutputError({
			type: "review_execution_invalid_json",
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

function harnessOutputError(
	error: Extract<RoasterResult<never>, { readonly type: "error" }>["error"],
): RoasterResult<never> {
	return { type: "error", error };
}
