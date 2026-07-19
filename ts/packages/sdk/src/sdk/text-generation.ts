import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

export interface TextGenerationRequest {
	modelSelection: ModelSelection;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: string;
}

export interface TextGenerationUsage {
	inputTokens: number;
	outputTokens: number;
}

export type TextGenerationResult =
	| { ok: true; text: string; usage?: TextGenerationUsage }
	| { ok: false; error: string };

export interface TextGenerator {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}
