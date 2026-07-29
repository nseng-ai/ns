import { cleanupSessionResources, type Api, type Model } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-agent-core";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
// Temporary while Pi Coding Agent's ModelRegistry uses global dispatch.
// Canonical migration plan (Phase 9): https://github.com/earendil-works/pi/blob/main/packages/agent/docs/models.md
import type { completeSimple } from "@earendil-works/pi-ai/compat";

export type PiModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

export interface PiModelRegistryLike {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<PiModelAuth>;
}

export type CompleteSimpleFunction = typeof completeSimple;

export type PiModelCallFailureReason =
	| "unsupported-thinking"
	| "model-unavailable"
	| "auth"
	| "empty-auth"
	| "aborted"
	| "request-failed";

export type PiModelTextResult =
	| { ok: true; text: string }
	| { ok: false; reason: PiModelCallFailureReason; message: string | null };

export interface CallPiModelTextOptions {
	registry: PiModelRegistryLike;
	modelSelection: ModelSelection;
	systemPrompt: string;
	userText: string;
	maxTokens: number;
	signal?: AbortSignal;
	timeoutMs?: number;
	completeFn?: CompleteSimpleFunction;
}

export async function callPiModelText(options: CallPiModelTextOptions): Promise<PiModelTextResult> {
	if (options.modelSelection.thinking === "off") {
		return {
			ok: false,
			reason: "unsupported-thinking",
			message: 'Pi completeSimple does not support thinking level "off".',
		};
	}
	const model = options.registry.find(
		options.modelSelection.provider,
		options.modelSelection.modelId,
	);
	if (model === undefined) return { ok: false, reason: "model-unavailable", message: null };
	const auth = await options.registry.getApiKeyAndHeaders(model);
	if (!auth.ok) return { ok: false, reason: "auth", message: auth.error };
	if (auth.apiKey === undefined || auth.apiKey.length === 0)
		return { ok: false, reason: "empty-auth", message: null };

	const requestSessionId = uuidv7();
	try {
		const completeFn = options.completeFn ?? (await loadCompleteSimple());
		const response = await completeFn(
			model as Model<Api>,
			{
				systemPrompt: options.systemPrompt,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: options.userText }],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				sessionId: requestSessionId,
				...(auth.headers === undefined ? {} : { headers: auth.headers }),
				...(options.signal === undefined ? {} : { signal: options.signal }),
				maxTokens: options.maxTokens,
				reasoning: options.modelSelection.thinking,
				...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
			},
		);
		if (response.stopReason === "aborted")
			return { ok: false, reason: "aborted", message: response.errorMessage ?? null };
		if (response.stopReason === "error")
			return { ok: false, reason: "request-failed", message: response.errorMessage ?? null };
		const text = response.content
			.filter(
				(part): part is { type: "text"; text: string } =>
					part.type === "text" && typeof part.text === "string",
			)
			.map((part) => part.text)
			.join("\n");
		return { ok: true, text };
	} catch (error) {
		if (options.signal?.aborted) return { ok: false, reason: "aborted", message: null };
		return {
			ok: false,
			reason: "request-failed",
			message: error instanceof Error ? error.message : String(error),
		};
	} finally {
		cleanupSessionResources(requestSessionId);
	}
}

/** Lazy so deterministic extension paths never pay the pi-ai import. */
async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai/compat");
	return piAi.completeSimple;
}
