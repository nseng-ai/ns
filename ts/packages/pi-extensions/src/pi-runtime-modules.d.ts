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

declare module "@earendil-works/pi-coding-agent" {
	export function getMarkdownTheme(): unknown;
}

declare module "@earendil-works/pi-tui" {
	export const Key: Record<string, string>;
	export function matchesKey(data: string, key: string): boolean;
	export function truncateToWidth(value: string, width: number, ellipsis?: string): string;
	export function wrapTextWithAnsi(value: string, width: number): string[];
	export function visibleWidth(value: string): number;

	export class Editor {
		focused?: boolean;
		onSubmit?: (value: string) => void;
		constructor(tui: unknown, theme: unknown);
		setText(value: string): void;
		render(width: number): string[];
		handleInput(data: string): void;
		invalidate?(): void;
	}

	export class Markdown {
		constructor(text: string, paddingX: number, paddingY: number, theme: unknown);
		render(width: number): string[];
	}
}
