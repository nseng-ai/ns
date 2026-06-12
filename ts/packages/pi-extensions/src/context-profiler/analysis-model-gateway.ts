/**
 * Analysis-model gateway: the external-call boundary for context-profiler LM
 * work. The real adapter talks to the fixed cheap analysis model through Pi's
 * model registry; failures are values (never throws to callers) so the
 * profiler can degrade gracefully. Pure parse/repair/payload logic lives in
 * segmentation.ts and analysis.ts.
 */

import { callPiModelText, type CompleteSimpleFunction, type PiModelRegistryLike } from "../pi-model-call.ts";
import { EPISODE_ANALYSIS_SYSTEM_PROMPT, parseEpisodeAnalysisResponseText, type EpisodeAnalysis } from "./analysis.ts";
import {
	parseSegmentationResponseText,
	SEGMENTATION_MODEL,
	SEGMENTATION_PROVIDER,
	SEGMENTATION_SYSTEM_PROMPT,
	type LmSegmentation,
} from "./segmentation.ts";

export type { PiModelRegistryLike as AnalysisModelRegistry } from "../pi-model-call.ts";

/** Fixed analysis model — never the session's main model. */
export const ANALYSIS_MODEL_PROVIDER = SEGMENTATION_PROVIDER;
export const ANALYSIS_MODEL_ID = SEGMENTATION_MODEL;

/** Bounded output: ≤12 episode starts, ≤24 delegations, plus one sentence fits comfortably. */
const SEGMENTATION_MAX_TOKENS = 2_048;
/** Bounded output: a verdict pair plus a 4–8 line opinionated summary. */
const EPISODE_ANALYSIS_MAX_TOKENS = 1_024;

export type AnalysisModelErrorCode = "model-unavailable" | "auth" | "request-failed" | "invalid-response" | "aborted";

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
	readonly analysisModel: string;
	segmentTurns(request: SegmentationRequest, options: { signal: AbortSignal }): Promise<SegmentationCallResult>;
	analyzeEpisode(request: EpisodeAnalysisRequest, options: { signal: AbortSignal }): Promise<EpisodeAnalysisCallResult>;
}

export function createCodexAnalysisModelGateway(
	registry: PiModelRegistryLike,
	overrides: { completeFn?: CompleteSimpleFunction } = {},
): AnalysisModelGateway {
	return {
		analysisModel: `${ANALYSIS_MODEL_PROVIDER}/${ANALYSIS_MODEL_ID}`,
		async segmentTurns(request, options) {
			return callAnalysisModel({
				registry,
				overrides,
				signal: options.signal,
				systemPrompt: SEGMENTATION_SYSTEM_PROMPT,
				json: request.json,
				maxTokens: SEGMENTATION_MAX_TOKENS,
				abortedMessage: "segmentation request aborted",
				parse: parseSegmentationResponseText,
			});
		},
		async analyzeEpisode(request, options) {
			return callAnalysisModel({
				registry,
				overrides,
				signal: options.signal,
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
	overrides: { completeFn?: CompleteSimpleFunction };
	signal: AbortSignal;
	systemPrompt: string;
	json: string;
	maxTokens: number;
	abortedMessage: string;
	parse: (text: string) => { ok: true; value: T } | { ok: false; error: string };
}

async function callAnalysisModel<T>(options: CallAnalysisModelOptions<T>): Promise<{ ok: true; value: T } | { ok: false; error: AnalysisModelError }> {
	const response = await callPiModelText({
		registry: options.registry,
		provider: ANALYSIS_MODEL_PROVIDER,
		modelId: ANALYSIS_MODEL_ID,
		systemPrompt: options.systemPrompt,
		userText: options.json,
		maxTokens: options.maxTokens,
		reasoning: "minimal",
		signal: options.signal,
		...(options.overrides.completeFn === undefined ? {} : { completeFn: options.overrides.completeFn }),
	});
	if (!response.ok) return mapModelFailure(response, options.abortedMessage);
	const parsed = options.parse(response.text);
	if (!parsed.ok) return failure("invalid-response", parsed.error);
	return { ok: true, value: parsed.value };
}

function mapModelFailure(
	response: Exclude<Awaited<ReturnType<typeof callPiModelText>>, { ok: true }>,
	abortedMessage: string,
): { ok: false; error: AnalysisModelError } {
	switch (response.reason) {
		case "model-unavailable":
			return failure("model-unavailable", `${ANALYSIS_MODEL_PROVIDER}/${ANALYSIS_MODEL_ID} is not available`);
		case "auth":
			return failure("auth", response.message ?? "analysis model auth failed");
		case "empty-auth":
			return failure("auth", `no ${ANALYSIS_MODEL_PROVIDER} auth found; run /login or configure Pi auth`);
		case "aborted":
			return failure("aborted", abortedMessage);
		case "request-failed":
			return failure("request-failed", response.message ?? "analysis model request failed");
	}
}

function failure(code: AnalysisModelErrorCode, message: string): { ok: false; error: AnalysisModelError } {
	return { ok: false, error: { code, message } };
}
