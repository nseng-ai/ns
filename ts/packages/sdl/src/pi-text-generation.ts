import type { Api, completeSimple, Model } from "@earendil-works/pi-ai";

import { formatErrorMessage } from "@asdl/core/primitives";

import type {
	TextGenerationGateway,
	TextGenerationRequest,
	TextGenerationResult,
} from "./text-generation.ts";

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_REASONING = "low";
const DEFAULT_TIMEOUT_MS = 120_000;

type CompleteSimpleFunction = typeof completeSimple;

type ModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

export interface PiModelRegistry {
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKeyAndHeaders(model: Model<Api>): Promise<ModelAuth>;
}

export interface PiTextGenerationGatewayOptions {
	modelRegistry?: PiModelRegistry;
	completeSimple?: CompleteSimpleFunction;
	loadDefaultModelRegistry?: () => Promise<PiModelRegistry>;
}

export class PiTextGenerationGateway implements TextGenerationGateway {
	private readonly modelRegistry: PiModelRegistry | undefined;
	private readonly completeSimple: CompleteSimpleFunction | undefined;
	private readonly loadDefaultModelRegistry: () => Promise<PiModelRegistry>;

	constructor(options: PiTextGenerationGatewayOptions = {}) {
		this.modelRegistry = options.modelRegistry;
		this.completeSimple = options.completeSimple;
		this.loadDefaultModelRegistry = options.loadDefaultModelRegistry ?? loadDefaultModelRegistry;
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		const parsed = parsePiModelRef(request.modelRef);
		if (!parsed.ok) {
			return { ok: false, error: parsed.error };
		}

		const modelRegistry = this.modelRegistry ?? (await this.loadDefaultModelRegistry());
		const model = modelRegistry.find(parsed.provider, parsed.modelId);
		if (model === undefined) {
			return { ok: false, error: `Could not find Pi model ${request.modelRef}.` };
		}

		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			return { ok: false, error: `Pi auth failed for ${request.modelRef}: ${auth.error}` };
		}
		if (!auth.apiKey) {
			return {
				ok: false,
				error: `No Pi auth found for ${parsed.provider}. Run /login or configure Pi auth.`,
			};
		}

		try {
			const completeSimple = this.completeSimple ?? (await loadCompleteSimple());
			const response = await completeSimple(
				model,
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
				.filter(
					(content): content is { type: "text"; text: string } =>
						content.type === "text" && typeof content.text === "string",
				)
				.map((content) => content.text)
				.join("\n");
			if (text.trim().length === 0) {
				return { ok: false, error: `Pi model ${request.modelRef} returned empty text.` };
			}

			return { ok: true, text };
		} catch (error) {
			return {
				ok: false,
				error: `Pi model ${request.modelRef} failed to generate text: ${formatErrorMessage(error)}`,
			};
		}
	}
}

type ParsedPiModelRef =
	| { ok: true; provider: string; modelId: string }
	| { ok: false; error: string };

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

async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai");
	return piAi.completeSimple;
}

async function loadDefaultModelRegistry(): Promise<PiModelRegistry> {
	const { AuthStorage, ModelRegistry } = await import("@earendil-works/pi-coding-agent");
	return ModelRegistry.create(AuthStorage.create());
}
