import type { Api, completeSimple, Model } from "@earendil-works/pi-ai";

export type PiModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

export interface PiModelRegistryLike {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<PiModelAuth>;
}

export type CompleteSimpleFunction = typeof completeSimple;

export type PiModelCallFailureReason =
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
	provider: string;
	modelId: string;
	systemPrompt: string;
	userText: string;
	maxTokens: number;
	reasoning: "minimal" | "low";
	signal?: AbortSignal;
	timeoutMs?: number;
	completeFn?: CompleteSimpleFunction;
}

export async function callPiModelText(options: CallPiModelTextOptions): Promise<PiModelTextResult> {
	const model = options.registry.find(options.provider, options.modelId);
	if (model === undefined) return { ok: false, reason: "model-unavailable", message: null };
	const auth = await options.registry.getApiKeyAndHeaders(model);
	if (!auth.ok) return { ok: false, reason: "auth", message: auth.error };
	if (auth.apiKey === undefined || auth.apiKey.length === 0)
		return { ok: false, reason: "empty-auth", message: null };

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
				...(auth.headers === undefined ? {} : { headers: auth.headers }),
				...(options.signal === undefined ? {} : { signal: options.signal }),
				maxTokens: options.maxTokens,
				reasoning: options.reasoning,
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
	}
}

/** Lazy so deterministic extension paths never pay the pi-ai import. */
async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai");
	return piAi.completeSimple;
}
