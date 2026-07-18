export type TextGenerationReasoning = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: TextGenerationReasoning;
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
