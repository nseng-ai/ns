/**
 * Analysis-model gateway: the external-call boundary for context-profiler LM
 * work. The real adapter routes each operation through its resolved shared
 * model-policy selection; failures are values so the profiler can degrade
 * gracefully. Pure parse/repair/payload logic lives in segmentation.ts and
 * analysis.ts.
 */

import { formatModelRef, type ModelSelection } from "@nseng-ai/foundation/model-slug";
import {
	callPiModelText,
	type CompleteSimpleFunction,
	type PiModelRegistryLike,
} from "@nseng-ai/pi-runtime/models/call";
import {
	EPISODE_ANALYSIS_SYSTEM_PROMPT,
	parseEpisodeAnalysisResponseText,
	type EpisodeAnalysis,
} from "./analysis.ts";
import {
	parseSegmentationResponseText,
	SEGMENTATION_SYSTEM_PROMPT,
	type LmSegmentation,
} from "./segmentation.ts";

export type { PiModelRegistryLike as AnalysisModelRegistry } from "@nseng-ai/pi-runtime/models/call";

/** Bounded output: ≤12 episode starts, ≤24 delegations, plus one sentence fits comfortably. */
const SEGMENTATION_MAX_TOKENS = 2_048;
/** Bounded output: a verdict pair plus a 4–8 line opinionated summary. */
const EPISODE_ANALYSIS_MAX_TOKENS = 1_024;

export type AnalysisModelErrorCode =
	| "model-unavailable"
	| "auth"
	| "request-failed"
	| "invalid-response"
	| "aborted";

export interface AnalysisModelError {
	code: AnalysisModelErrorCode;
	message: string;
}

export type SegmentationCallResult =
	| { ok: true; value: LmSegmentation }
	| { ok: false; error: AnalysisModelError };

export type EpisodeAnalysisCallResult =
	| { ok: true; value: EpisodeAnalysis }
	| { ok: false; error: AnalysisModelError };

export interface SegmentationRequest {
	/** Serialized payload from buildSegmentationPayload, sent verbatim. */
	json: string;
}

export interface EpisodeAnalysisRequest {
	/** Serialized payload from buildEpisodeAnalysisPayload, sent verbatim. */
	json: string;
}

export interface AnalysisModelGateway {
	readonly segmentationSelection: ModelSelection;
	readonly episodeAnalysisSelection: ModelSelection;
	readonly segmentationModel: string;
	readonly episodeAnalysisModel: string;
	segmentTurns(
		request: SegmentationRequest,
		options: { signal: AbortSignal },
	): Promise<SegmentationCallResult>;
	analyzeEpisode(
		request: EpisodeAnalysisRequest,
		options: { signal: AbortSignal },
	): Promise<EpisodeAnalysisCallResult>;
}

export interface CreateAnalysisModelGatewayOptions {
	registry: PiModelRegistryLike;
	segmentationSelection: ModelSelection;
	episodeAnalysisSelection: ModelSelection;
	completeFn?: CompleteSimpleFunction;
}

export function createAnalysisModelGateway(
	options: CreateAnalysisModelGatewayOptions,
): AnalysisModelGateway {
	return {
		segmentationSelection: options.segmentationSelection,
		episodeAnalysisSelection: options.episodeAnalysisSelection,
		segmentationModel: formatModelRef(options.segmentationSelection),
		episodeAnalysisModel: formatModelRef(options.episodeAnalysisSelection),
		async segmentTurns(request, callOptions) {
			return callAnalysisModel({
				registry: options.registry,
				modelSelection: options.segmentationSelection,
				...(options.completeFn === undefined ? {} : { completeFn: options.completeFn }),
				signal: callOptions.signal,
				systemPrompt: SEGMENTATION_SYSTEM_PROMPT,
				json: request.json,
				maxTokens: SEGMENTATION_MAX_TOKENS,
				abortedMessage: "segmentation request aborted",
				parse: parseSegmentationResponseText,
			});
		},
		async analyzeEpisode(request, callOptions) {
			return callAnalysisModel({
				registry: options.registry,
				modelSelection: options.episodeAnalysisSelection,
				...(options.completeFn === undefined ? {} : { completeFn: options.completeFn }),
				signal: callOptions.signal,
				systemPrompt: EPISODE_ANALYSIS_SYSTEM_PROMPT,
				json: request.json,
				maxTokens: EPISODE_ANALYSIS_MAX_TOKENS,
				abortedMessage: "episode analysis request aborted",
				parse: parseEpisodeAnalysisResponseText,
			});
		},
	};
}

interface CallAnalysisModelOptions<T> {
	registry: PiModelRegistryLike;
	modelSelection: ModelSelection;
	completeFn?: CompleteSimpleFunction;
	signal: AbortSignal;
	systemPrompt: string;
	json: string;
	maxTokens: number;
	abortedMessage: string;
	parse: (text: string) => { ok: true; value: T } | { ok: false; error: string };
}

async function callAnalysisModel<T>(
	options: CallAnalysisModelOptions<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: AnalysisModelError }> {
	const response = await callPiModelText({
		registry: options.registry,
		modelSelection: options.modelSelection,
		systemPrompt: options.systemPrompt,
		userText: options.json,
		maxTokens: options.maxTokens,
		signal: options.signal,
		...(options.completeFn === undefined ? {} : { completeFn: options.completeFn }),
	});
	if (!response.ok) {
		return mapModelFailure(response, options.modelSelection, options.abortedMessage);
	}
	const parsed = options.parse(response.text);
	if (!parsed.ok) return failure("invalid-response", parsed.error);
	return { ok: true, value: parsed.value };
}

function mapModelFailure(
	response: Exclude<Awaited<ReturnType<typeof callPiModelText>>, { ok: true }>,
	selection: ModelSelection,
	abortedMessage: string,
): { ok: false; error: AnalysisModelError } {
	switch (response.reason) {
		case "unsupported-thinking":
			return failure("request-failed", response.message ?? "unsupported thinking level");
		case "model-unavailable":
			return failure("model-unavailable", `${formatModelRef(selection)} is not available`);
		case "auth":
			return failure("auth", response.message ?? "analysis model auth failed");
		case "empty-auth":
			return failure(
				"auth",
				`no ${selection.provider} auth found; run /login or configure Pi auth`,
			);
		case "aborted":
			return failure("aborted", abortedMessage);
		case "request-failed":
			return failure("request-failed", response.message ?? "analysis model request failed");
	}
}

function failure(
	code: AnalysisModelErrorCode,
	message: string,
): { ok: false; error: AnalysisModelError } {
	return { ok: false, error: { code, message } };
}
