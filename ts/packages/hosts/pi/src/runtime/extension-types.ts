import type { ExecResult } from "@ji/core/exec";
import type {
	SessionReplacementContext,
	SessionReplacementOptions,
	SessionReplacementResult,
	SessionUserMessageOptions,
} from "./sessions-replacement.ts";
import type { ThinkingLevel } from "./types.ts";
import type { ExtensionMode, ToolContext, ToolDefinition } from "./tool-types.ts";

export type { ExecResult } from "@ji/core/exec";
export type { ModelInfo, ThinkingLevel } from "./types.ts";
export type {
	ExtensionMode,
	NotifyLevel,
	SetWidgetFunction,
	ToolContext,
	ToolDefinition,
	ToolResult,
	WidgetPlacement,
	WidgetRuntimeContext,
} from "./tool-types.ts";

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

export type SendUserMessageOptions = SessionUserMessageOptions;
export type { SessionReplacementResult };

export interface ReplacedSessionContext extends BaseRuntimeContext, SessionReplacementContext {
	sendUserMessage(content: string, options?: SendUserMessageOptions): Promise<void>;
	sendMessage?(message: CustomMessage): Promise<void>;
}

export type NewSessionOptions = SessionReplacementOptions<ReplacedSessionContext>;

export type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

export interface SessionManagerLike {
	/** Path to the current Pi session file, when one is available. */
	getSessionFile?(): string | undefined;
}

export interface BaseRuntimeContext extends ToolContext {
	mode: ExtensionMode;
	sessionManager?: SessionManagerLike;
	ui: ToolContext["ui"] & {
		setEditorText?(value: string): void;
		custom?<T>(
			factory: (
				tui: TuiHandle,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => RenderComponent,
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
	newSession?(options?: NewSessionOptions): Promise<SessionReplacementResult>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool?(definition: ToolDefinition): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<ExecResult>;
	getCommands?(): CommandInfo[];
	getThinkingLevel?(): ThinkingLevel;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
	sendUserMessage(content: string, options?: SendUserMessageOptions): void;
}
