import type { NotifyLevel } from "@nseng-ai/pi/runtime/tool-types";

import type { GrillAskOutcome } from "./controller.ts";
import type { GrillAskDetails } from "./result.ts";
import type { SideQuestStartedInfo } from "./sidequest/protocol.ts";

export type { NotifyLevel };

interface TextContent {
	type: "text";
	text: string;
}

export interface ToolResult<Details = unknown> {
	content: TextContent[];
	details: Details;
	terminate?: boolean;
}

export interface GrillAskOption {
	value: string;
	label: string;
	description?: string;
}

export interface GrillAskRecommendation {
	answer: string;
	rationale?: string;
	optionValue?: string;
}

export type GrillAskRemainingEstimate =
	| {
			kind: "exact";
			count: number;
			basis?: string;
	  }
	| {
			kind: "range";
			min: number;
			max: number;
			basis: string;
	  }
	| {
			kind: "unknown";
			basis: string;
	  };

export interface GrillAskInput {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	estimatedRemaining?: GrillAskRemainingEstimate;
	allowFreeform?: boolean;
	allowEnd?: boolean;
}

export interface GrillAskViewOptions {
	canStartSideQuest?: boolean;
}

export interface NormalizedGrillAskInput {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	estimatedRemaining?: GrillAskRemainingEstimate;
	allowFreeform: boolean;
	allowEnd: boolean;
}

export type GrillAskUiRunner = (
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
	viewOptions?: GrillAskViewOptions,
) => Promise<GrillAskOutcome | undefined>;

export interface GrillAskExecutionOptions {
	uiRunner?: GrillAskUiRunner;
	signal?: AbortSignal;
	/** Tool call id of the running grill_ask execution; correlates the side-quest mark entry. */
	toolCallId?: string;
	/** Notified when a freeform answer starts a side quest, so hooks can label the mark. */
	onSideQuestStarted?: (info: SideQuestStartedInfo) => void;
}

export interface GrillAskCustomComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	isFocused?: boolean;
	dispose?(): void;
}

export interface GrillAskToolContext {
	hasUI: boolean;
	ui: {
		select?(title: string, options: string[]): Promise<string | undefined>;
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		custom?<T>(
			factory: (
				tui: unknown,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => GrillAskCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
	sessionManager?: {
		getBranch(): readonly unknown[];
	};
}

export interface GrillUiCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		notify?(message: string, level?: NotifyLevel): void;
	};
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
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: GrillAskToolContext,
	): Promise<ToolResult<GrillAskDetails>> | ToolResult<GrillAskDetails>;
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
	sendUserMessage(content: string): void;
}
