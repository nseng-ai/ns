declare module "@earendil-works/pi-ai" {
	export function completeSimple(
		model: unknown,
		input: {
			systemPrompt: string;
			messages: Array<{
				role: "user";
				content: Array<{ type: "text"; text: string }>;
				timestamp: number;
			}>;
		},
		options: {
			apiKey: string;
			headers?: Record<string, string>;
			maxTokens: number;
			reasoning: "minimal" | "low";
			timeoutMs: number;
		},
	): Promise<{
		stopReason: string;
		errorMessage?: string;
		content: Array<{ type: string; text?: string }>;
	}>;
}
