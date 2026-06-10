/**
 * Segmentation gateway: the external-call boundary for LM episode
 * segmentation. The real adapter talks to the fixed analysis model through
 * Pi's model registry; failures are values (never throws to callers) so the
 * profiler can degrade gracefully. Repair lives above the gateway — it needs
 * the snapshot's turn list — so a success here is validated but unrepaired.
 */

import type * as PiAi from "@earendil-works/pi-ai";
import {
	parseSegmentationResponseText,
	SEGMENTATION_MODEL,
	SEGMENTATION_PROVIDER,
	SEGMENTATION_SYSTEM_PROMPT,
	type LmSegmentation,
} from "./segmentation.ts";

/** Bounded output: ≤12 episode starts plus one sentence fits comfortably. */
const SEGMENTATION_MAX_TOKENS = 2_048;

export type SegmentationErrorCode = "model-unavailable" | "auth" | "request-failed" | "invalid-response" | "aborted";

export interface SegmentationError {
	code: SegmentationErrorCode;
	message: string;
}

export type SegmentationCallResult =
	| { ok: true; value: LmSegmentation }
	| { ok: false; error: SegmentationError };

export interface SegmentationRequest {
	/** Serialized payload from buildSegmentationPayload, sent verbatim. */
	json: string;
}

export interface SegmentationGateway {
	segmentTurns(request: SegmentationRequest, options: { signal: AbortSignal }): Promise<SegmentationCallResult>;
}

type SegmentationModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

/** Minimal structural twin of ctx.modelRegistry (same pattern as fast-text-draft). */
export interface SegmentationModelRegistry {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<SegmentationModelAuth>;
}

type CompleteSimpleFunction = typeof PiAi.completeSimple;

export function createCodexSegmentationGateway(
	registry: SegmentationModelRegistry,
	overrides: { completeFn?: CompleteSimpleFunction } = {},
): SegmentationGateway {
	return {
		async segmentTurns(request, options) {
			const model = registry.find(SEGMENTATION_PROVIDER, SEGMENTATION_MODEL);
			if (model === undefined) {
				return failure("model-unavailable", `${SEGMENTATION_PROVIDER}/${SEGMENTATION_MODEL} is not available`);
			}
			const auth = await registry.getApiKeyAndHeaders(model);
			if (!auth.ok) return failure("auth", auth.error);
			if (auth.apiKey === undefined || auth.apiKey.length === 0) {
				return failure("auth", `no ${SEGMENTATION_PROVIDER} auth found; run /login or configure Pi auth`);
			}
			try {
				const completeFn = overrides.completeFn ?? (await loadCompleteSimple());
				const response = await completeFn(
					model as PiAi.Model<PiAi.Api>,
					{
						systemPrompt: SEGMENTATION_SYSTEM_PROMPT,
						messages: [{ role: "user", content: [{ type: "text", text: request.json }], timestamp: Date.now() }],
					},
					{
						apiKey: auth.apiKey,
						...(auth.headers === undefined ? {} : { headers: auth.headers }),
						signal: options.signal,
						maxTokens: SEGMENTATION_MAX_TOKENS,
						reasoning: "minimal",
					},
				);
				if (response.stopReason === "aborted") return failure("aborted", "segmentation request aborted");
				if (response.stopReason === "error") {
					return failure("request-failed", response.errorMessage ?? "segmentation request failed");
				}
				const text = response.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
					.map((part) => part.text)
					.join("\n");
				const parsed = parseSegmentationResponseText(text);
				if (!parsed.ok) return failure("invalid-response", parsed.error);
				return { ok: true, value: parsed.value };
			} catch (error) {
				if (options.signal.aborted) return failure("aborted", "segmentation request aborted");
				return failure("request-failed", error instanceof Error ? error.message : String(error));
			}
		},
	};
}

/** Lazy so the profiler's deterministic path never pays the pi-ai import. */
async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai");
	return piAi.completeSimple;
}

function failure(code: SegmentationErrorCode, message: string): SegmentationCallResult {
	return { ok: false, error: { code, message } };
}
