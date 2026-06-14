export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: "checkpoint-message" | "pr-description";
}

export type TextGenerationResult = { ok: true; text: string } | { ok: false; error: string };

export interface TextGenerationGateway {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export const DEFAULT_PR_DESCRIPTION_MODEL_REF = "openai-codex/gpt-5.4-mini";
export const PR_DESCRIPTION_MODEL_ENV = "ASDL_DEV_PR_DESCRIPTION_MODEL";

export function selectPrDescriptionModelRef(env: Record<string, string | undefined>): string {
	const modelRef = env[PR_DESCRIPTION_MODEL_ENV]?.trim();
	if (modelRef !== undefined && modelRef !== "") {
		return modelRef;
	}
	return DEFAULT_PR_DESCRIPTION_MODEL_REF;
}
