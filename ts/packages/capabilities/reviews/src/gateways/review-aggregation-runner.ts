import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewAggregationFailure, ReviewResult } from "../core/failures.ts";
import {
	reviewAggregationExecutionResponseSchema,
	reviewAggregationRunnerRequestSchema,
	type ReviewAggregationExecutionResponse,
	type ReviewAggregationRunnerRequest,
} from "../core/models.ts";
import {
	resolveReviewsModelReference,
	type ReviewsHarness,
} from "../core/review-model-reference.ts";
import {
	buildReviewAggregationJsonSchema,
	reviewAggregationResponseFromPayload,
} from "./review-aggregation-output.ts";
import {
	buildReviewAggregationPrompt,
	reviewAggregationSystemPrompt,
} from "./review-aggregation-prompt.ts";
import {
	structuredOutputHarnessLabel,
	type StructuredOutputHarnessRequest,
	type StructuredOutputTransport,
	type StructuredOutputTransportFailure,
} from "./structured-output-transport.ts";

export interface RunReviewAggregationOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewAggregationRunnerGateway {
	runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>>;
}

export interface RoutingReviewAggregationRunnerOptions {
	readonly transport: StructuredOutputTransport;
}

export class RoutingReviewAggregationRunner implements ReviewAggregationRunnerGateway {
	private readonly transport: StructuredOutputTransport;

	constructor(options: RoutingReviewAggregationRunnerOptions) {
		this.transport = options.transport;
	}

	async runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		const resolved = resolveReviewsModelReference(request.model);
		if (!resolved.ok || resolved.value.harness === "pi") {
			return resultErr({
				code: "review-aggregation-model-resolution-failed",
				message: resolved.ok
					? `Reviews model ${JSON.stringify(request.model)} is not supported by the review aggregation harness.`
					: resolved.error.message,
			});
		}
		const outcome = await this.transport.run(
			aggregationTransportRequest({
				harness: resolved.value.harness,
				modelId: resolved.value.modelId,
				promptText: buildReviewAggregationPrompt(request),
			}),
			options,
		);
		if (!outcome.ok) return resultErr(aggregationFailureFromTransport(outcome.error));
		return reviewAggregationResponseFromPayload({
			payload: outcome.value.payload,
			usage: outcome.value.usage,
			harnessLabel: structuredOutputHarnessLabel(resolved.value.harness),
		});
	}
}

function aggregationTransportRequest(options: {
	readonly harness: ReviewsHarness;
	readonly modelId: string;
	readonly promptText: string;
}): StructuredOutputHarnessRequest {
	const shared = {
		modelId: options.modelId,
		systemPrompt: reviewAggregationSystemPrompt(),
		promptText: options.promptText,
		jsonSchema: buildReviewAggregationJsonSchema(),
	};
	switch (options.harness) {
		case "claude-code":
			return { harness: "claude-code", ...shared, tools: ["Read"] };
		case "codex":
			return { harness: "codex", ...shared, inputTag: "aggregation-input" };
		case "pi":
			throw new Error("Pi aggregation requests must be rejected before transport planning.");
	}
}

function aggregationFailureFromTransport(
	failure: StructuredOutputTransportFailure,
): ReviewAggregationFailure {
	switch (failure.code) {
		case "binary-missing":
		case "invocation-failed":
		case "execution-failed":
		case "output-read-failed":
			return { code: "review-aggregation-invocation-failed", message: failure.message };
		case "cancelled":
			return { code: "review-aggregation-cancelled", message: failure.message };
		case "empty-output":
		case "invalid-response":
			return { code: "review-aggregation-invalid-output", message: failure.message };
		case "invalid-json":
			return { code: "review-aggregation-invalid-json", message: failure.message };
	}
}

export class FakeReviewAggregationRunnerGateway implements ReviewAggregationRunnerGateway {
	private readonly result: ReviewResult<ReviewAggregationExecutionResponse>;
	private readonly callsInternal: {
		request: ReviewAggregationRunnerRequest;
		options: RunReviewAggregationOptions;
	}[] = [];

	constructor(
		result: ReviewResult<ReviewAggregationExecutionResponse> = {
			ok: true,
			value: { payload: { clusters: [] }, usage: null },
		},
	) {
		this.result = copyAggregationResult(result);
	}

	async runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		this.callsInternal.push({
			request: reviewAggregationRunnerRequestSchema.parse(structuredClone(request)),
			options: copyOptions(options),
		});
		return copyAggregationResult(this.result);
	}

	calls(): readonly {
		readonly request: ReviewAggregationRunnerRequest;
		readonly options: RunReviewAggregationOptions;
	}[] {
		return this.callsInternal.map((call) => ({
			request: reviewAggregationRunnerRequestSchema.parse(structuredClone(call.request)),
			options: copyOptions(call.options),
		}));
	}
}

function copyAggregationResult(
	result: ReviewResult<ReviewAggregationExecutionResponse>,
): ReviewResult<ReviewAggregationExecutionResponse> {
	return result.ok
		? {
				ok: true,
				value: reviewAggregationExecutionResponseSchema.parse(structuredClone(result.value)),
			}
		: structuredClone(result);
}

function copyOptions(options: RunReviewAggregationOptions): RunReviewAggregationOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: { ...options.env } }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
