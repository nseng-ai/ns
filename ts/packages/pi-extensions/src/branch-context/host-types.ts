import type { Component } from "@earendil-works/pi-tui";
import type {
	BranchCreationMethod,
	createBranchContextFromFile,
	loadBranchContextPlan,
} from "@asdl/branch-context";
import type { ExecOptions, ExecResult } from "@asdl/core/exec";
import type {
	SessionReplacementContext,
	SessionReplacementOptions,
	SessionReplacementResult,
} from "@asdl/pi-extension-runtime/session-replacement";
import type { resolveSelectedSavedPlanFile, writeSavedPlanFile } from "@asdl/plans";
import type { SendMessageOptions } from "../message-delivery.ts";

export type NotifyLevel = "info" | "warning" | "error";

export interface TextContent {
	type: "text";
	text: string;
}

export type CustomMessageContent = string | TextContent[];

export interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

export interface ToolResult {
	content: TextContent[];
	details?: unknown;
}

export type ToolUpdateHandler = (update: Partial<ToolResult>) => void;

export type SessionHistoryEntry = unknown;

export interface SessionManagerLike {
	getBranch?(): SessionHistoryEntry[];
	getEntries?(): SessionHistoryEntry[];
	getSessionFile?(): string | undefined;
}

export type NewSessionResult = SessionReplacementResult;

export interface ReplacedSessionContext extends CommandContext, SessionReplacementContext {
	sendMessage(message: CustomMessage, options?: SendMessageOptions): Promise<void> | void;
	sendUserMessage(content: string): Promise<void> | void;
}

export type NewSessionOptions = SessionReplacementOptions<
	ReplacedSessionContext,
	SessionManagerLike
>;

export interface BranchContextOperations {
	loadBranchContextPlan: typeof loadBranchContextPlan;
	createBranchContextFromFile: typeof createBranchContextFromFile;
	writeSavedPlanFile: typeof writeSavedPlanFile;
	resolveSelectedSavedPlanFile: typeof resolveSelectedSavedPlanFile;
}

export interface BranchContextExtensionOptions {
	branchContextDefaultCreation?: BranchCreationMethod;
	branchContextPrefix?: string;
	planStoreRoot?: string;
	branchContextOperations?: BranchContextOperations | undefined;
}

export interface ToolContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		setStatus?(key: string, value: string | undefined): void;
	};
}

export interface ToolRenderResultOptions {
	isPartial: boolean;
}

export interface ToolDefinition {
	name: string;
	label?: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: Record<string, unknown>;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ToolUpdateHandler | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
	renderCall?(args: unknown, theme: unknown, context: unknown): Component;
	renderResult?(
		result: ToolResult,
		options: ToolRenderResultOptions,
		theme: unknown,
		context: unknown,
	): Component;
}

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		confirm?(title: string, message?: string): Promise<boolean>;
	};
	waitForIdle(): Promise<void>;
	newSession(options?: NewSessionOptions): Promise<NewSessionResult>;
	sessionManager?: SessionManagerLike;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendMessage?(message: CustomMessage, options?: SendMessageOptions): void;
	sendUserMessage(content: string): void;
}
