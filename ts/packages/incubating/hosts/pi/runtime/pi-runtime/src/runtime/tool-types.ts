import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { PiSessionReader } from "@nseng-ai/extension-kit/pi-types";

import type { ModelInfo } from "./types.ts";

export interface TextContent {
	type: "text";
	text: string;
}

export type NotifyLevel = "info" | "warning" | "error";

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export type WidgetPlacement = "aboveEditor" | "belowEditor";

/** Subset of Pi's ThemeColor used by ns widgets; the real Theme accepts a superset. */
export type WidgetThemeColor =
	| "accent"
	| "success"
	| "error"
	| "warning"
	| "muted"
	| "dim"
	| "text";

/**
 * Structural view of Pi's Theme. The real Theme is a class with private
 * members, so widget code and test fakes depend on this minimal contract
 * instead; contravariance keeps factories assignable to Pi's
 * `(tui: TUI, theme: Theme) => Component` overload.
 */
export interface WidgetTheme {
	fg(color: WidgetThemeColor, text: string): string;
	bold?(text: string): string;
}

/** Structural view of Pi's TUI limited to widget render invalidation. */
export interface WidgetTuiRenderHandle {
	requestRender(): void;
}

export interface WidgetComponent extends ToolRenderComponent {
	dispose?(): void;
}

export type WidgetComponentFactory = (
	tui: WidgetTuiRenderHandle,
	theme: WidgetTheme,
) => WidgetComponent;

export type WidgetContent = string[] | WidgetComponentFactory;

export interface SetWidgetFunction {
	(key: string, content: string[] | undefined, options?: { placement?: WidgetPlacement }): void;
	(
		key: string,
		content: WidgetComponentFactory | undefined,
		options?: { placement?: WidgetPlacement },
	): void;
}

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
	/** Concrete host registry used by in-process child-session adapters. */
	modelRegistry?: ModelRegistry;
	sessionManager: PiSessionReader;
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
