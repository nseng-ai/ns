import type { GrillAskRemainingEstimate } from "../protocol.ts";

/**
 * Structural types for the grill side-quest workflow. Like the grill module's
 * own `ExtensionAPI`, these declare only the Pi host capabilities this
 * directory uses so the whole feature stays fake-drivable and rip-out
 * friendly: deleting `src/grill/sidequest/` removes every consumer.
 *
 * Session entries are scanned structurally at runtime; real Pi shapes are
 * narrowed at read time, matching the `progress.ts` precedent.
 */
export type SessionEntryLike = unknown;

export interface SidequestSessionManagerLike {
	getBranch(): readonly SessionEntryLike[];
	getEntries?(): readonly SessionEntryLike[];
}

export interface SidequestUiContext {
	setWidget?(
		key: string,
		content: string[] | undefined,
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
	select?(title: string, options: string[]): Promise<string | undefined>;
	notify?(message: string, level?: "info" | "warning" | "error"): void;
}

/** Structural subset of Pi's read-only `ExtensionContext` used by event handlers. */
export interface SidequestEventContext {
	hasUI: boolean;
	ui: SidequestUiContext;
	sessionManager?: SidequestSessionManagerLike;
}

/** Structural subset of Pi's `ExtensionCommandContext` used by command handlers. */
export interface SidequestCommandContext extends SidequestEventContext {
	waitForIdle(): Promise<void>;
	navigateTree(
		targetId: string,
		options?: {
			summarize?: boolean;
			customInstructions?: string;
			replaceInstructions?: boolean;
			label?: string;
		},
	): Promise<{ cancelled: boolean }>;
}

export interface SidequestTreePreparationLike {
	targetId: string;
	userWantsSummary: boolean;
	customInstructions?: string;
	label?: string;
}

export interface SidequestBeforeTreeEvent {
	preparation: SidequestTreePreparationLike;
}

export interface SidequestBeforeTreeResult {
	cancel?: boolean;
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

export interface SidequestSummaryEntryLike {
	id: string;
	parentId: string | null;
}

export interface SidequestTreeEvent {
	newLeafId: string | null;
	oldLeafId: string | null;
	summaryEntry?: SidequestSummaryEntryLike;
}

export type SidequestEventHandler<TEvent, TResult = void> = (
	event: TEvent,
	ctx: SidequestEventContext,
) => Promise<TResult | undefined> | TResult | undefined;

export interface SidequestCommandDefinition {
	description?: string;
	handler(args: string, ctx: SidequestCommandContext): Promise<void> | void;
}

/**
 * Pi host surface required by `registerGrillSidequest`. The grill module's
 * base `ExtensionAPI` deliberately omits `on`/`appendEntry`/`setLabel`, so
 * side-quest registration is guarded by `isSidequestCapableHost`.
 */
export interface SidequestHost {
	registerCommand(name: string, options: SidequestCommandDefinition): void;
	sendUserMessage(content: string): void;
	on(
		event: "session_before_tree",
		handler: SidequestEventHandler<SidequestBeforeTreeEvent, SidequestBeforeTreeResult>,
	): void;
	on(event: "session_tree", handler: SidequestEventHandler<SidequestTreeEvent>): void;
	on(
		event: "agent_settled" | "turn_end" | "session_start" | "session_shutdown",
		handler: SidequestEventHandler<unknown>,
	): void;
	appendEntry(customType: string, data?: unknown): void;
	setLabel(entryId: string, label: string | undefined): void;
}

export interface SideQuestStartedInfo {
	toolCallId: string;
	topic: string;
	question: string;
}

export interface GrillSidequestLatestAsk {
	question: string;
	toolCallId?: string;
	estimatedRemaining?: GrillAskRemainingEstimate;
}

export interface ActiveSideQuest {
	/** Session entry id of the mark: the side-quest tool result or the command kickoff message. */
	markEntryId: string;
	/** Tool call id of the stamped side-quest result; absent for command-initiated quests. */
	toolCallId?: string;
	topic: string;
	/** Question that was pending when the quest started; absent when no ask was found. */
	pendingQuestion?: string;
}

export type SidequestScanState =
	| { grill: "none" }
	| { grill: "ended"; answeredCount: number }
	| {
			grill: "active";
			answeredCount: number;
			latestAsk?: GrillSidequestLatestAsk;
			activeQuest?: ActiveSideQuest;
	  };
