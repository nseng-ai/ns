/**
 * Analysis-model gateway: the external-call boundary for context-profiler LM
 * work. The real adapter talks to the fixed cheap analysis model through Pi's
 * model registry; failures are values (never throws to callers) so the
 * profiler can degrade gracefully. Pure parse/repair/payload logic lives in
 * segmentation.ts and analysis.ts.
 */

import type * as PiAi from "@earendil-works/pi-ai";
import { EPISODE_ANALYSIS_SYSTEM_PROMPT, parseEpisodeAnalysisResponseText, type EpisodeAnalysis } from "./analysis.ts";
import {
	parseSegmentationResponseText,
	SEGMENTATION_MODEL,
	SEGMENTATION_PROVIDER,
	SEGMENTATION_SYSTEM_PROMPT,
	type LmSegmentation,
} from "./segmentation.ts";

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
	segmentTurns(request: SegmentationRequest, options: { signal: AbortSignal }): Promise<SegmentationCallResult>;
	analyzeEpisode(request: EpisodeAnalysisRequest, options: { signal: AbortSignal }): Promise<EpisodeAnalysisCallResult>;
}

type AnalysisModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

/** Minimal structural twin of ctx.modelRegistry (same pattern as fast-text-draft). */
export interface AnalysisModelRegistry {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<AnalysisModelAuth>;
}

type CompleteSimpleFunction = typeof PiAi.completeSimple;

export function createCodexAnalysisModelGateway(
	registry: AnalysisModelRegistry,
	overrides: { completeFn?: CompleteSimpleFunction } = {},
): AnalysisModelGateway {
	return {
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
	registry: AnalysisModelRegistry;
	overrides: { completeFn?: CompleteSimpleFunction };
	signal: AbortSignal;
	systemPrompt: string;
	json: string;
	maxTokens: number;
	abortedMessage: string;
	parse: (text: string) => { ok: true; value: T } | { ok: false; error: string };
}

async function callAnalysisModel<T>(options: CallAnalysisModelOptions<T>): Promise<{ ok: true; value: T } | { ok: false; error: AnalysisModelError }> {
	const model = options.registry.find(ANALYSIS_MODEL_PROVIDER, ANALYSIS_MODEL_ID);
	if (model === undefined) {
		return failure("model-unavailable", `${ANALYSIS_MODEL_PROVIDER}/${ANALYSIS_MODEL_ID} is not available`);
	}
	const auth = await options.registry.getApiKeyAndHeaders(model);
	if (!auth.ok) return failure("auth", auth.error);
	if (auth.apiKey === undefined || auth.apiKey.length === 0) {
		return failure("auth", `no ${ANALYSIS_MODEL_PROVIDER} auth found; run /login or configure Pi auth`);
	}
	try {
		const completeFn = options.overrides.completeFn ?? (await loadCompleteSimple());
		const response = await completeFn(
			model as PiAi.Model<PiAi.Api>,
			{
				systemPrompt: options.systemPrompt,
				messages: [{ role: "user", content: [{ type: "text", text: options.json }], timestamp: Date.now() }],
			},
			{
				apiKey: auth.apiKey,
				...(auth.headers === undefined ? {} : { headers: auth.headers }),
				signal: options.signal,
				maxTokens: options.maxTokens,
				reasoning: "minimal",
			},
		);
		if (response.stopReason === "aborted") return failure("aborted", options.abortedMessage);
		if (response.stopReason === "error") return failure("request-failed", response.errorMessage ?? "analysis model request failed");
		const text = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("\n");
		const parsed = options.parse(text);
		if (!parsed.ok) return failure("invalid-response", parsed.error);
		return { ok: true, value: parsed.value };
	} catch (error) {
		if (options.signal.aborted) return failure("aborted", options.abortedMessage);
		return failure("request-failed", error instanceof Error ? error.message : String(error));
	}
}

/** Lazy so the profiler's deterministic path never pays the pi-ai import. */
async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai");
	return piAi.completeSimple;
}

function failure(code: AnalysisModelErrorCode, message: string): { ok: false; error: AnalysisModelError } {
	return { ok: false, error: { code, message } };
}
