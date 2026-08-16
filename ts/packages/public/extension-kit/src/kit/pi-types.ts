export interface RawPiExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export interface RawPiExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export type NotifyLevel = "info" | "warning" | "error" | "success";
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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

/**
 * Structural stand-in for Pi's widget component factory. extension-kit does not
 * model the TUI handle or theme, so the parameters are `never`: any concrete
 * factory type remains assignable here, while extension-kit callers pass line
 * arrays instead of factories.
 */
export type WidgetContentFactoryLike = (tui: never, theme: never) => unknown;

export interface UiLike {
	notify(message: string, level?: NotifyLevel): void;
	setStatus?(key: string, value: string | undefined): void;
	/** Render lines in a keyed widget; Pi places widgets above the editor by default. */
	setWidget?(
		key: string,
		content: string[] | WidgetContentFactoryLike | undefined,
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
	confirm?(title: string, message: string): Promise<boolean>;
	input?(title: string, placeholder?: string): Promise<string | undefined>;
	select?(title: string, items: string[]): Promise<string | undefined>;
	addAutocompleteProvider?(factory: (current: AutocompleteProvider) => AutocompleteProvider): void;
	setEditorText?(value: string): void;
}

export interface PiSessionEntry {
	readonly type: string;
	readonly [field: string]: unknown;
}

export interface PiSessionReader {
	/** Entries on the active branch of the current Pi session. */
	getBranch(): readonly PiSessionEntry[];
	/** All entries in the current Pi session. */
	getEntries(): readonly PiSessionEntry[];
	/** Stable id of the current Pi session, including in-memory sessions. */
	getSessionId(): string;
	/**
	 * Path to the current Pi session's persisted JSONL log. In-memory Pi sessions
	 * have an identity and entries but no backing file, so they return undefined.
	 */
	getSessionFile(): string | undefined;
}

export interface BaseContext {
	cwd: string;
	hasUI?: boolean;
	ui: UiLike;
	sessionManager: PiSessionReader;
}

export interface EffectiveSkillInfo {
	name: string;
	filePath: string;
	baseDir: string;
}

export interface SystemPromptOptions {
	skills?: readonly EffectiveSkillInfo[];
}

export interface CommandContext extends BaseContext {
	model?: ModelInfo;
	modelRegistry: ModelRegistry;
	getSystemPromptOptions(): SystemPromptOptions;
	waitForIdle(): Promise<void>;
}

export interface AgentEndEventLike {
	messages: ReadonlyArray<{
		role?: unknown;
		content?: unknown;
	}>;
}

export interface AgentEndContext {
	hasUI?: boolean;
	ui: UiLike;
}

export interface AgentSettledContext {
	hasUI?: boolean;
	ui: UiLike;
}

export interface InputEventLike {
	text: string;
	source: "interactive" | "rpc" | "extension";
}

export type SessionStartContext = BaseContext;

/**
 * Structural mirror of Pi's session_start event. `reason` distinguishes the
 * initial process startup from reloads and session replacement.
 */
export interface SessionStartEventLike {
	reason: "startup" | "reload" | "new" | "resume" | "fork";
}

export interface CommandDefinition {
	description?: string;
	argumentHint?: string;
	getArgumentCompletions?: (
		prefix: string,
	) => Promise<AutocompleteItem[] | null> | AutocompleteItem[] | null;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

export interface EntryRenderTheme {
	fg(color: string, text: string): string;
	bold?(text: string): string;
}

export interface EntryRenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export interface CustomEntryLike {
	customType: string;
	data?: unknown;
}

export type EntryRenderer = (
	entry: CustomEntryLike,
	options: { expanded: boolean },
	theme: EntryRenderTheme,
) => EntryRenderComponent;

export interface CustomMessage {
	customType: string;
	content: string | Array<{ type: "text"; text: string }>;
	display: boolean;
	details?: unknown;
}

export interface SkillCommandInfoLike {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
}

export interface ExtensionAPI {
	on(
		event: "agent_end",
		handler: (_event: unknown, ctx: AgentEndContext) => Promise<void> | void,
	): void;
	on(
		event: "session_start",
		handler: (event: SessionStartEventLike, ctx: SessionStartContext) => Promise<void> | void,
	): void;
	registerCommand(name: string, options: CommandDefinition): void;
	exec(command: string, args: string[], options?: RawPiExecOptions): Promise<RawPiExecResult>;
	getCommands(): readonly SkillCommandInfoLike[];
	getAllTools?(): Array<{ name: string }>;
	getThinkingLevel(): ThinkingLevel;
	setThinkingLevel(level: ThinkingLevel): void;
	setModel(model: ModelInfo): Promise<boolean>;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	/** Persist a TUI-only custom entry; entries do not participate in LLM context. */
	appendEntry(customType: string, data?: unknown): void;
	/** Register a TUI renderer for custom entries created with appendEntry. */
	registerEntryRenderer(customType: string, renderer: EntryRenderer): void;
	sendUserMessage(content: string): void;
}
