import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { ReviewResult } from "../core/failures.ts";
import {
	reviewAggregationExecutionResponseSchema,
	reviewAggregationProposalSchema,
	type ReviewAggregationExecutionResponse,
	type ReviewUsage,
} from "../core/models.ts";

export function buildReviewAggregationJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(reviewAggregationProposalSchema, { io: "output" }) as Record<
		string,
		unknown
	>;
	delete schema.$schema;
	return schema;
}

export function reviewAggregationResponseFromPayload(options: {
	readonly payload: unknown;
	readonly usage: ReviewUsage | null;
	readonly harnessLabel: string;
}): ReviewResult<ReviewAggregationExecutionResponse> {
	const proposal = reviewAggregationProposalSchema.safeParse(options.payload);
	if (!proposal.success) {
		return resultErr({
			code: "review-aggregation-invalid-output",
			message: `${options.harnessLabel} structured output did not match the aggregation schema: ${proposal.error.message}`,
		});
	}
	return {
		ok: true,
		value: reviewAggregationExecutionResponseSchema.parse({
			payload: proposal.data,
			usage: options.usage,
		}),
	};
}

export function parseClaudeCodeAggregationOutput(
	stdout: string,
): ReviewResult<ReviewAggregationExecutionResponse> {
	if (stdout.trim() === "") {
		return resultErr({
			code: "review-aggregation-invalid-output",
			message: "Claude Code produced no JSON output.",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout) as unknown;
	} catch (error) {
		return resultErr({
			code: "review-aggregation-invalid-json",
			message: `Claude Code output was not valid JSON: ${formatErrorMessage(error)}`,
		});
	}
	const events = Array.isArray(parsed) ? parsed : [parsed];
	const resultEvent = events.find(
		(event): event is Record<string, unknown> => isRecord(event) && event.type === "result",
	);
	const terminal = resultEvent ?? (isRecord(parsed) ? parsed : undefined);
	if (terminal === undefined || !Object.hasOwn(terminal, "structured_output")) {
		return resultErr({
			code: "review-aggregation-invalid-output",
			message: "Claude Code result did not include structured_output.",
		});
	}
	return reviewAggregationResponseFromPayload({
		payload: terminal.structured_output,
		usage: aggregationUsageFromResultEvent(terminal),
		harnessLabel: "Claude Code",
	});
}

export function parseCodexAggregationOutput(
	output: string,
): ReviewResult<ReviewAggregationExecutionResponse> {
	if (output.trim() === "") {
		return resultErr({
			code: "review-aggregation-invalid-output",
			message: "Codex produced no structured output.",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(output) as unknown;
	} catch (error) {
		return resultErr({
			code: "review-aggregation-invalid-json",
			message: `Codex structured output was not valid JSON: ${formatErrorMessage(error)}`,
		});
	}
	return reviewAggregationResponseFromPayload({
		payload: parsed,
		usage: null,
		harnessLabel: "Codex",
	});
}

function aggregationUsageFromResultEvent(event: Record<string, unknown>): ReviewUsage | null {
	const usage = event.usage;
	if (!isRecord(usage)) return null;
	const parsed = z
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
		.safeParse({
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
			cacheCreationInputTokens: usage.cache_creation_input_tokens,
			cacheReadInputTokens: usage.cache_read_input_tokens,
			totalCostUsd: event.total_cost_usd,
			durationMs: event.duration_ms,
			numTurns: event.num_turns,
		});
	return parsed.success ? parsed.data : null;
}
