import type { ModelInfo } from "./types.ts";

export interface TextContent {
	type: "text";
	text: string;
}

export type NotifyLevel = "info" | "warning" | "error";

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export type WidgetPlacement = "aboveEditor" | "belowEditor";

export type SetWidgetFunction = (
	key: string,
	content: string[] | undefined,
	options?: { placement?: WidgetPlacement },
) => void;

export interface WidgetRuntimeContext {
	hasUI: boolean;
	ui?: { setWidget?: SetWidgetFunction };
}

export interface ToolResult<Details = unknown> {
	content: TextContent[];
	details?: Details;
	isError?: boolean;
	/** External Pi tool-result contract; Pi documents this field as `terminate`. */
	terminate?: boolean;
}

export interface ToolRenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export interface ToolTuiHandle {
	stop(): void;
	start(): void;
	requestRender(force?: boolean): void;
}

export interface ToolContext extends WidgetRuntimeContext {
	cwd: string;
	mode: ExtensionMode;
	model?: ModelInfo;
	sessionManager?: { getSessionFile?(): string | undefined };
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setEditorText?(value: string): void;
		setStatus?(key: string, value: string | undefined): void;
		setWidget?: SetWidgetFunction;
		custom?<T>(
			factory: (
				tui: ToolTuiHandle,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => ToolRenderComponent,
			options?: unknown,
		): Promise<T>;
	};
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
