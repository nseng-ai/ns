import { cleanupSessionResources, type Api, type Model } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-agent-core";
// Temporary while Pi Coding Agent's ModelRegistry uses global dispatch.
// Canonical migration plan (Phase 9): https://github.com/earendil-works/pi/blob/main/packages/agent/docs/models.md
import type { completeSimple } from "@earendil-works/pi-ai/compat";

import { formatModelRef } from "@nseng-ai/foundation/model-slug";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "@nseng-ai/sdk";

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_REASONING = "low";
const DEFAULT_TIMEOUT_MS = 120_000;

type CompleteSimpleFunction = typeof completeSimple;

type ModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

interface PiModelRegistry {
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKeyAndHeaders(model: Model<Api>): Promise<ModelAuth>;
}

interface PiTextGeneratorOptions {
	modelRegistry?: PiModelRegistry;
	completeSimple?: CompleteSimpleFunction;
	loadDefaultModelRegistry?: () => Promise<PiModelRegistry>;
	createRequestSessionId?: () => string;
	cleanupRequestSession?: (sessionId: string) => void;
}

export class PiTextGenerator implements TextGenerator {
	private readonly modelRegistry: PiModelRegistry | undefined;
	private readonly completeSimple: CompleteSimpleFunction | undefined;
	private readonly loadDefaultModelRegistry: () => Promise<PiModelRegistry>;
	private readonly createRequestSessionId: () => string;
	private readonly cleanupRequestSession: (sessionId: string) => void;

	constructor(options: PiTextGeneratorOptions = {}) {
		this.modelRegistry = options.modelRegistry;
		this.completeSimple = options.completeSimple;
		this.loadDefaultModelRegistry = options.loadDefaultModelRegistry ?? loadDefaultModelRegistry;
		this.createRequestSessionId = options.createRequestSessionId ?? uuidv7;
		this.cleanupRequestSession = options.cleanupRequestSession ?? cleanupSessionResources;
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		const modelRef = formatModelRef(request.modelSelection);
		const modelRegistry = this.modelRegistry ?? (await this.loadDefaultModelRegistry());
		const model = modelRegistry.find(
			request.modelSelection.provider,
			request.modelSelection.modelId,
		);
		if (model === undefined) {
			return { ok: false, error: `Could not find Pi model ${modelRef}.` };
		}

		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			return { ok: false, error: `Pi auth failed for ${modelRef}: ${auth.error}` };
		}
		if (!auth.apiKey) {
			return {
				ok: false,
				error: `No Pi auth found for ${request.modelSelection.provider}. Run /login or configure Pi auth.`,
			};
		}

		const requestSessionId = this.createRequestSessionId();
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
					sessionId: requestSessionId,
					maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
					reasoning: request.reasoning ?? DEFAULT_REASONING,
					timeoutMs: DEFAULT_TIMEOUT_MS,
				},
			);

			if (response.stopReason === "error" || response.stopReason === "aborted") {
				return {
					ok: false,
					error: `Pi model ${modelRef} failed to generate text: ${response.errorMessage ?? response.stopReason}`,
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
				return { ok: false, error: `Pi model ${modelRef} returned empty text.` };
			}

			const usage = textGenerationUsageFromResponse(response.usage);
			return { ok: true, text, ...(usage === undefined ? {} : { usage }) };
		} catch (error) {
			return {
				ok: false,
				error: `Pi model ${modelRef} failed to generate text: ${formatErrorMessage(error)}`,
			};
		} finally {
			this.cleanupRequestSession(requestSessionId);
		}
	}
}

function textGenerationUsageFromResponse(usage: {
	input: number;
	output: number;
}): TextGenerationUsage | undefined {
	if (!Number.isFinite(usage.input) || !Number.isFinite(usage.output)) return undefined;
	return { inputTokens: usage.input, outputTokens: usage.output };
}

async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai/compat");
	return piAi.completeSimple;
}

async function loadDefaultModelRegistry(): Promise<PiModelRegistry> {
	const { AuthStorage, ModelRegistry } = await import("@earendil-works/pi-coding-agent");
	return ModelRegistry.create(AuthStorage.create());
}
