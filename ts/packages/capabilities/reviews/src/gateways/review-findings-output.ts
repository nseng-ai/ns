import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { ReviewResult } from "../core/failures.ts";
import {
	createFindingsReview,
	reviewExecutionResponseSchema,
	reviewFindingsPayloadSchema,
	type ReviewExecutionResponse,
	type ReviewInputCoverage,
	type ReviewUsage,
} from "../core/models.ts";

export function buildReviewFindingsJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(reviewFindingsPayloadSchema, { io: "output" }) as Record<
		string,
		unknown
	>;
	// Both harness CLIs accept the draft keywords, while Claude omits structured output when this URI is present.
	delete schema.$schema;
	return schema;
}

export function reviewResponseFromFindingsPayload(options: {
	readonly payload: unknown;
	readonly inputCoverage: ReviewInputCoverage | null;
	readonly usage: ReviewUsage | null;
	readonly harnessLabel: string;
}): ReviewResult<ReviewExecutionResponse> {
	const findings = reviewFindingsPayloadSchema.safeParse(options.payload);
	if (!findings.success) {
		return resultErr({
			code: "review-execution-invalid-findings",
			message: `${options.harnessLabel} structured output did not match the findings schema: ${findings.error.message}`,
		});
	}

	try {
		return {
			ok: true,
			value: reviewExecutionResponseSchema.parse({
				payload: createFindingsReview(findings.data.findings),
				usage: options.usage,
				inputCoverage: options.inputCoverage,
			}),
		};
	} catch (error) {
		return resultErr({
			code: "review-execution-invalid-findings",
			message: `${options.harnessLabel} structured output did not match the findings schema: ${formatErrorMessage(error)}`,
		});
	}
}
