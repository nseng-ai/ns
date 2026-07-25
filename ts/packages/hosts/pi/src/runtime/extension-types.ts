import type { PiSessionReader } from "@nseng-ai/extension-kit/pi-types";

import type {
	SessionReplacementContext,
	SessionReplacementOptions,
	SessionReplacementResult,
	SessionUserMessageOptions,
} from "./sessions-replacement.ts";
import type { ThinkingLevel } from "./types.ts";
import type { ExtensionMode, ToolContext, ToolDefinition } from "./tool-types.ts";

export interface RawPiExecResult {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code: number;
	readonly killed?: boolean;
}

export interface RawPiExecOptions {
	readonly cwd?: string;
	readonly signal?: AbortSignal;
	readonly timeout?: number;
}
export type { PiSessionEntry, PiSessionReader } from "@nseng-ai/extension-kit/pi-types";
export type { ModelInfo, ThinkingLevel } from "./types.ts";
export type {
	ExtensionMode,
	NotifyLevel,
	SetWidgetFunction,
	ToolContext,
	ToolDefinition,
	ToolResult,
	WidgetComponent,
	WidgetComponentFactory,
	WidgetContent,
	WidgetPlacement,
	WidgetRuntimeContext,
	WidgetTheme,
	WidgetThemeColor,
	WidgetTuiRenderHandle,
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

export interface BaseRuntimeContext extends ToolContext {
	mode: ExtensionMode;
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
	sessionManager: PiSessionReader;
	ui: BaseRuntimeContext["ui"] & {
		select?(title: string, items: string[]): Promise<string | undefined>;
		input?(title: string, placeholder?: string): Promise<string | undefined>;
	};
	waitForIdle(): Promise<void>;
	newSession?(options?: NewSessionOptions): Promise<SessionReplacementResult>;
}

export interface ExtensionAPI {
	on?(event: string, handler: (...args: never[]) => unknown): void;
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
	exec(command: string, args: string[], options?: RawPiExecOptions): Promise<RawPiExecResult>;
	getCommands?(): CommandInfo[];
	getAllTools?(): Array<{ name: string }>;
	getThinkingLevel?(): ThinkingLevel;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
	sendUserMessage(content: string, options?: SendUserMessageOptions): void;
}
