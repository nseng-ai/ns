import { mapFromRecordOrMap, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult, ReviewRunnerFailure } from "../core/failures.ts";
import {
	createFindingsReview,
	reviewRunnerRequestSchema,
	reviewExecutionResponseSchema,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
} from "../core/models.ts";
import {
	resolveReviewsModelReference,
	type ReviewsHarness,
} from "../core/review-model-reference.ts";
import {
	buildReviewFindingsJsonSchema,
	reviewResponseFromFindingsPayload,
} from "./review-findings-output.ts";
import {
	assembleReviewPrompt,
	systemPromptFindings,
	systemPromptFindingsJsonText,
} from "./review-runner-prompt.ts";
import {
	structuredOutputHarnessLabel,
	type StructuredOutputHarnessRequest,
	type StructuredOutputTransport,
	type StructuredOutputTransportFailure,
} from "./structured-output-transport.ts";

export interface RunReviewOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewRunnerGateway {
	runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>>;
}

export interface RoutingReviewRunnerOptions {
	readonly transport: StructuredOutputTransport;
}

export class RoutingReviewRunner implements ReviewRunnerGateway {
	private readonly transport: StructuredOutputTransport;

	constructor(options: RoutingReviewRunnerOptions) {
		this.transport = options.transport;
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const resolved = resolveReviewsModelReference(request.model);
		if (!resolved.ok) return resolved;
		const assembled = assembleReviewPrompt(request);
		const outcome = await this.transport.run(
			reviewTransportRequest({
				harness: resolved.value.harness,
				modelId: resolved.value.modelId,
				promptText: assembled.promptText,
			}),
			options,
		);
		if (!outcome.ok) return resultErr(reviewFailureFromTransport(outcome.error));
		return reviewResponseFromFindingsPayload({
			payload: outcome.value.payload,
			usage: outcome.value.usage,
			inputCoverage: assembled.inputCoverage,
			harnessLabel: structuredOutputHarnessLabel(resolved.value.harness),
		});
	}
}

function reviewTransportRequest(options: {
	readonly harness: ReviewsHarness;
	readonly modelId: string;
	readonly promptText: string;
}): StructuredOutputHarnessRequest {
	const shared = {
		modelId: options.modelId,
		systemPrompt: systemPromptFindings(),
		promptText: options.promptText,
		jsonSchema: buildReviewFindingsJsonSchema(),
	};
	switch (options.harness) {
		case "claude-code":
			return { harness: "claude-code", ...shared, tools: ["Bash", "Read"] };
		case "codex":
			return { harness: "codex", ...shared, inputTag: "review-input" };
		case "pi":
			return { harness: "pi", ...shared, systemPrompt: systemPromptFindingsJsonText() };
	}
}

function reviewFailureFromTransport(
	failure: StructuredOutputTransportFailure,
): ReviewRunnerFailure {
	switch (failure.code) {
		case "binary-missing":
			return { code: "harness-binary-missing", message: failure.message };
		case "invocation-failed":
			return { code: "harness-invocation-failed", message: failure.message };
		case "execution-failed":
			return { code: "harness-execution-failed", message: failure.message };
		case "cancelled":
			return { code: "review-execution-cancelled", message: failure.message };
		case "empty-output":
		case "output-read-failed":
			return { code: "review-execution-empty-output", message: failure.message };
		case "invalid-json":
			return { code: "review-execution-invalid-json", message: failure.message };
		case "invalid-response":
			return { code: "review-execution-invalid-response", message: failure.message };
	}
}

export interface FakeReviewRunnerGatewayOptions {
	readonly resultsByReviewName?:
		| ReadonlyMap<string, ReviewResult<ReviewExecutionResponse>>
		| Record<string, ReviewResult<ReviewExecutionResponse>>;
	readonly defaultResult?: ReviewResult<ReviewExecutionResponse>;
}

export class FakeReviewRunnerGateway implements ReviewRunnerGateway {
	private readonly resultsByReviewName: Map<string, ReviewResult<ReviewExecutionResponse>>;
	private readonly defaultResult: ReviewResult<ReviewExecutionResponse>;
	private readonly callsInternal: { request: ReviewRunnerRequest; options: RunReviewOptions }[] =
		[];

	constructor(options: FakeReviewRunnerGatewayOptions = {}) {
		this.resultsByReviewName = new Map<string, ReviewResult<ReviewExecutionResponse>>();
		for (const [key, value] of mapFromRecordOrMap(options.resultsByReviewName)) {
			this.resultsByReviewName.set(key, copyResult(value));
		}
		this.defaultResult = copyResult(
			options.defaultResult ?? {
				ok: true,
				value: { payload: createFindingsReview([]), usage: null, inputCoverage: null },
			},
		);
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const copiedRequest = copyRequest(request);
		this.callsInternal.push({ request: copiedRequest, options: copyRunReviewOptions(options) });
		return copyResult(
			this.resultsByReviewName.get(request.reviewDefinition.name) ?? this.defaultResult,
		);
	}

	calls(): readonly {
		readonly request: ReviewRunnerRequest;
		readonly options: RunReviewOptions;
	}[] {
		return this.callsInternal.map((call) => ({
			request: copyRequest(call.request),
			options: copyRunReviewOptions(call.options),
		}));
	}
}

function copyRequest(request: ReviewRunnerRequest): ReviewRunnerRequest {
	return reviewRunnerRequestSchema.parse(structuredClone(request));
}

function copyResult(
	result: ReviewResult<ReviewExecutionResponse>,
): ReviewResult<ReviewExecutionResponse> {
	if (result.ok) {
		return {
			ok: true,
			value: reviewExecutionResponseSchema.parse(structuredClone(result.value)),
		};
	}
	return structuredClone(result);
}

function copyRunReviewOptions(options: RunReviewOptions): RunReviewOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: { ...options.env } }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
