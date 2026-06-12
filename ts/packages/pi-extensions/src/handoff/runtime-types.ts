import type { ExecResult } from "@asdl/core/exec";
import type { ModelInfo, ThinkingLevel } from "../cmux/types.ts";

export type { ExecResult } from "@asdl/core/exec";
export type { ModelInfo, ThinkingLevel } from "../cmux/types.ts";

export type NotifyLevel = "info" | "warning" | "error";

export interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

export interface CommandInfo {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		source?: string;
		scope?: string;
		origin?: string;
		baseDir?: string;
	};
}

export interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface RenderTheme {
	fg(color: string, text: string): string;
	bold?(text: string): string;
}

export interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export interface TuiHandle {
	stop(): void;
	start(): void;
	requestRender(force?: boolean): void;
}

export interface ToolResult<Details = unknown> {
	content: Array<{ type: "text"; text: string }>;
	details?: Details;
	isError?: boolean;
}

export interface ToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: Record<string, unknown>;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
}

export type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export interface BaseRuntimeContext {
	cwd: string;
	hasUI: boolean;
	mode?: "tui" | "rpc" | "json" | "print";
	model?: ModelInfo;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setEditorText?(value: string): void;
		setStatus?(key: string, value: string | undefined): void;
		custom?<T>(
			factory: (tui: TuiHandle, theme: unknown, keybindings: unknown, done: (value: T) => void) => RenderComponent,
			options?: unknown,
		): Promise<T>;
	};
}

export interface CommandContext extends BaseRuntimeContext {
	ui: BaseRuntimeContext["ui"] & {
		select?(title: string, items: string[]): Promise<string | undefined>;
		input?(title: string, placeholder?: string): Promise<string | undefined>;
	};
	waitForIdle(): Promise<void>;
}

export interface ToolContext extends BaseRuntimeContext {}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool?(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
	getCommands?(): CommandInfo[];
	getThinkingLevel?(): ThinkingLevel;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
	sendUserMessage(content: string): void;
}
