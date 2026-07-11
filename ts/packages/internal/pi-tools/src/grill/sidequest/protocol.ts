import type { GrillAskRemainingEstimate } from "../protocol.ts";

/**
 * Structural types for the grill side-quest workflow. Like the grill module's
 * own `ExtensionAPI`, these declare only the Pi host capabilities this
 * directory uses so the optional capability stays fake-drivable. The grill
 * execution layer depends only on `GrillSidequestCapability`; registration
 * owns Pi event/session integration.
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

export interface PendingGrillAsk {
	question: string;
	toolCallId?: string;
	estimatedRemaining?: GrillAskRemainingEstimate;
}

export type GrillSidequestEvent =
	| {
			version: 1;
			event: "started";
			questId: string;
			topic: string;
			pendingAsk?: PendingGrillAsk;
	  }
	| {
			version: 1;
			event: "closed";
			questId: string;
	  };

export interface GrillSidequestCapability {
	/** Synchronously append the canonical start event and return its quest id. */
	startSideQuest(topic: string, pendingAsk: PendingGrillAsk | undefined): string;
}

export interface ActiveSideQuest {
	questId: string;
	/** Session entry id of the canonical started event. */
	markEntryId: string;
	topic: string;
	pendingAsk?: PendingGrillAsk;
}

export type SidequestScanState =
	| { grill: "none" }
	| { grill: "ended"; answeredCount: number }
	| {
			grill: "active";
			answeredCount: number;
			pendingAsk?: PendingGrillAsk;
			activeQuest?: ActiveSideQuest;
	  };
