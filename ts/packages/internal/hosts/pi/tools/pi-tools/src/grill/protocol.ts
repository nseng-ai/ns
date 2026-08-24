import type { SystemPromptOptions } from "@nseng-ai/pi-runtime/runtime/extension-types";
import type { NotifyLevel } from "@nseng-ai/pi-runtime/runtime/tool-types";

import type { GrillRoundToolContext, GrillRoundToolResult } from "./round-protocol.ts";

export type { NotifyLevel };

export interface GrillUiCommandContext {
	hasUI: boolean;
	ui: {
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		notify?(message: string, level?: NotifyLevel): void;
	};
	getSystemPromptOptions(): SystemPromptOptions;
	waitForIdle(): Promise<void>;
}

export interface ToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: object;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((update: Partial<GrillRoundToolResult>) => void) | undefined,
		ctx: GrillRoundToolContext,
	): Promise<GrillRoundToolResult> | GrillRoundToolResult;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: GrillUiCommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	getActiveTools(): string[];
	setActiveTools(names: string[]): void;
	sendUserMessage(content: string): void;
}
