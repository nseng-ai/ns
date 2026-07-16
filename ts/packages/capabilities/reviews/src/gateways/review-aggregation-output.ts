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
