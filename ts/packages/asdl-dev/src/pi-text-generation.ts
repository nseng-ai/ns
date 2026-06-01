import { completeSimple, type Api, type Model } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

import type { TextGenerationGateway, TextGenerationRequest, TextGenerationResult } from "./text-generation.ts";

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_REASONING = "low";
const DEFAULT_TIMEOUT_MS = 120_000;

export class PiTextGenerationGateway implements TextGenerationGateway {
	private readonly modelRegistry: ModelRegistry;

	constructor(modelRegistry: ModelRegistry = ModelRegistry.create(AuthStorage.create())) {
		this.modelRegistry = modelRegistry;
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		const parsed = parsePiModelRef(request.modelRef);
		if (!parsed.ok) {
			return { ok: false, error: parsed.error };
		}

		const model = this.modelRegistry.find(parsed.provider, parsed.modelId);
		if (model === undefined) {
			return { ok: false, error: `Could not find Pi model ${request.modelRef}.` };
		}

		const auth = await this.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			return { ok: false, error: `Pi auth failed for ${request.modelRef}: ${auth.error}` };
		}
		if (!auth.apiKey) {
			return { ok: false, error: `No Pi auth found for ${parsed.provider}. Run /login or configure Pi auth.` };
		}

		try {
			const response = await completeSimple(
				model as Model<Api>,
				{
					systemPrompt: request.system,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: request.prompt }],
							timestamp: Date.now(),
						},
					],
				},
				{
					...(auth.headers === undefined ? {} : { headers: auth.headers }),
					apiKey: auth.apiKey,
					maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
					reasoning: request.reasoning ?? DEFAULT_REASONING,
					timeoutMs: DEFAULT_TIMEOUT_MS,
				},
			);

			if (response.stopReason === "error" || response.stopReason === "aborted") {
				return {
					ok: false,
					error: `Pi model ${request.modelRef} failed to generate text: ${response.errorMessage ?? response.stopReason}`,
				};
			}

			const text = response.content
				.filter((content): content is { type: "text"; text: string } => content.type === "text" && typeof content.text === "string")
				.map((content) => content.text)
				.join("\n");
			if (text.trim().length === 0) {
				return { ok: false, error: `Pi model ${request.modelRef} returned empty text.` };
			}

			return { ok: true, text };
		} catch (error) {
			return { ok: false, error: `Pi model ${request.modelRef} failed to generate text: ${errorMessage(error)}` };
		}
	}
}

type ParsedPiModelRef = { ok: true; provider: string; modelId: string } | { ok: false; error: string };

function parsePiModelRef(modelRef: string): ParsedPiModelRef {
	const separator = modelRef.indexOf("/");
	if (separator <= 0 || separator === modelRef.length - 1) {
		return {
			ok: false,
			error: `Invalid Pi model reference ${JSON.stringify(modelRef)}. Expected provider/model-id.`,
		};
	}

	return {
		ok: true,
		provider: modelRef.slice(0, separator),
		modelId: modelRef.slice(separator + 1),
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
