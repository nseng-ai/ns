import type { ExecResult } from "@asdl/core/exec";

import type { SkillCommandInfo } from "../skill-expansion.ts";

export type { ExecResult } from "@asdl/core/exec";
export type NotifyLevel = "info" | "warning" | "error" | "success";
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const satisfies readonly ThinkingLevel[];
const THINKING_LEVEL_SET: ReadonlySet<unknown> = new Set(THINKING_LEVELS);

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return THINKING_LEVEL_SET.has(value);
}

export interface ModelInfo {
	provider: string;
	id: string;
}

export interface ModelRegistry {
	find(provider: string, modelId: string): ModelInfo | undefined;
}

export interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

export interface AutocompleteSuggestions {
	items: AutocompleteItem[];
	prefix: string;
}

export interface AutocompleteOptions {
	signal: AbortSignal;
}

export interface AutocompleteProvider {
	getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		options: AutocompleteOptions,
	): Promise<AutocompleteSuggestions | null> | AutocompleteSuggestions | null;
	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: AutocompleteItem,
		prefix: string,
	): unknown;
	shouldTriggerFileCompletion?(lines: string[], cursorLine: number, cursorCol: number): boolean;
}

export interface UiLike {
	notify(message: string, level?: NotifyLevel): void;
	setStatus?(key: string, value: string | undefined): void;
	confirm?(title: string, message: string): Promise<boolean>;
	select?(title: string, items: string[]): Promise<string | undefined>;
	addAutocompleteProvider?(factory: (current: AutocompleteProvider) => AutocompleteProvider): void;
}

export interface BaseContext {
	cwd: string;
	hasUI?: boolean;
	ui: UiLike;
	sessionManager?: {
		getBranch?(): unknown[];
		getEntries?(): unknown[];
	};
}

export interface CommandContext extends BaseContext {
	model?: ModelInfo;
	modelRegistry: ModelRegistry;
	waitForIdle(): Promise<void>;
}

export interface AgentEndContext {
	hasUI?: boolean;
	ui: UiLike;
}

export interface SessionStartContext extends BaseContext {}

export interface CommandDefinition {
	description?: string;
	argumentHint?: string;
	getArgumentCompletions?: (
		prefix: string,
	) => Promise<AutocompleteItem[] | null> | AutocompleteItem[] | null;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

export interface CustomMessage {
	customType: string;
	content: string | Array<{ type: "text"; text: string }>;
	display: boolean;
	details?: unknown;
}

export interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface ExtensionAPI {
	on(
		event: "agent_end",
		handler: (_event: unknown, ctx: AgentEndContext) => Promise<void> | void,
	): void;
	on(
		event: "session_start",
		handler: (_event: unknown, ctx: SessionStartContext) => Promise<void> | void,
	): void;
	registerCommand(name: string, options: CommandDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	getCommands(): readonly SkillCommandInfo[];
	getThinkingLevel(): ThinkingLevel;
	setThinkingLevel(level: ThinkingLevel): void;
	setModel(model: ModelInfo): Promise<boolean>;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	sendUserMessage(content: string): void;
}
