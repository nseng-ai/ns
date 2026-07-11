import {
	buildSideQuestMarkLabel,
	buildSideQuestResumeMessage,
	buildSideQuestReturnLabel,
	SIDE_QUEST_DISPOSITION_CHOICES,
	sideQuestDispositionFromChoice,
	sideQuestSummaryInstructions,
} from "./prompts.ts";
import type {
	SideQuestStartedInfo,
	SidequestBeforeTreeEvent,
	SidequestBeforeTreeResult,
	SidequestEventContext,
	SidequestHost,
	SidequestTreeEvent,
} from "./protocol.ts";
import {
	GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE,
	findToolResultEntryId,
	scanGrillBranchFromSessionManager,
	sideQuestClosureKey,
} from "./state.ts";
import { clearGrillStatusWidget, refreshGrillStatusWidget } from "./status.ts";

/**
 * Runtime state owned by `registerGrillSidequest`. Only cosmetic or
 * flow-control data lives here: the machine-readable quest state derives from
 * session entries, so losing this state (restart, reload) degrades gracefully.
 */
export interface GrillSidequestRuntimeState {
	/** Deferred ⚑ mark labels, keyed by grill_ask tool call id, applied on agent_settled. */
	pendingMarkLabels: Map<string, string>;
	/** Set while /pi:grill-return navigates, so the before-tree hook skips the picker. */
	isCommandInitiatedReturn: boolean;
}

export function createGrillSidequestRuntimeState(): GrillSidequestRuntimeState {
	return { pendingMarkLabels: new Map(), isCommandInitiatedReturn: false };
}

export function stashPendingMarkLabel(
	state: GrillSidequestRuntimeState,
	info: SideQuestStartedInfo,
): void {
	state.pendingMarkLabels.set(info.toolCallId, buildSideQuestMarkLabel(info.question));
}

export function handleAgentSettled(
	pi: SidequestHost,
	state: GrillSidequestRuntimeState,
	ctx: SidequestEventContext,
): void {
	flushPendingMarkLabels(pi, state, ctx);
	refreshGrillStatusWidget(ctx);
}

export async function handleSessionBeforeTree(
	event: SidequestBeforeTreeEvent,
	ctx: SidequestEventContext,
	state: GrillSidequestRuntimeState,
): Promise<SidequestBeforeTreeResult | undefined> {
	const scan = scanGrillBranchFromSessionManager(ctx.sessionManager);
	if (scan.grill !== "active" || scan.activeQuest === undefined) return undefined;
	const quest = scan.activeQuest;
	if (event.preparation.targetId !== quest.markEntryId) return undefined;

	if (state.isCommandInitiatedReturn) {
		// /pi:grill-return already chose the disposition and passed the
		// summarize/customInstructions/label overrides through navigateTree.
		state.isCommandInitiatedReturn = false;
		return undefined;
	}

	// Native tree jump to the mark. Pi's own "summarize?" choice already ran:
	// a native "no summary" is the Discard disposition, so only offer the
	// summary-shaping choices.
	if (!event.preparation.userWantsSummary) return undefined;
	if (ctx.hasUI === false || ctx.ui.select === undefined) return undefined;

	const choice = await ctx.ui.select(`Returning from side quest: ${quest.topic}`, [
		SIDE_QUEST_DISPOSITION_CHOICES["fold-in"],
		SIDE_QUEST_DISPOSITION_CHOICES.note,
	]);
	const disposition = sideQuestDispositionFromChoice(choice);
	if (disposition === undefined || disposition === "discard") return undefined;

	return {
		customInstructions: sideQuestSummaryInstructions(disposition),
		label: buildSideQuestReturnLabel(quest.topic),
	};
}

export function handleSessionTree(
	pi: SidequestHost,
	event: SidequestTreeEvent,
	ctx: SidequestEventContext,
): void {
	const scan = scanGrillBranchFromSessionManager(ctx.sessionManager);
	if (scan.grill === "active" && scan.activeQuest !== undefined) {
		const quest = scan.activeQuest;
		const hasLandedAtMark =
			event.newLeafId === quest.markEntryId || event.summaryEntry?.parentId === quest.markEntryId;
		if (hasLandedAtMark) {
			pi.appendEntry(GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE, {
				returned: sideQuestClosureKey(quest),
			});
			pi.sendUserMessage(buildSideQuestResumeMessage(quest.topic, quest.pendingQuestion));
		}
	}
	refreshGrillStatusWidget(ctx);
}

export function handleSessionShutdown(ctx: SidequestEventContext): void {
	clearGrillStatusWidget(ctx);
}

function flushPendingMarkLabels(
	pi: SidequestHost,
	state: GrillSidequestRuntimeState,
	ctx: SidequestEventContext,
): void {
	if (state.pendingMarkLabels.size === 0) return;
	const entries = readSessionEntries(ctx);
	if (entries === undefined) return;
	for (const [toolCallId, label] of [...state.pendingMarkLabels]) {
		const entryId = findToolResultEntryId(entries, toolCallId);
		if (entryId === undefined) continue;
		state.pendingMarkLabels.delete(toolCallId);
		try {
			pi.setLabel(entryId, label);
		} catch {
			// The label is a cosmetic navigation aid; the details stamp on the
			// tool result is the machine-readable mark.
		}
	}
}

function readSessionEntries(ctx: SidequestEventContext): readonly unknown[] | undefined {
	const getEntries = ctx.sessionManager?.getEntries;
	if (getEntries === undefined) return undefined;
	try {
		const entries = getEntries.call(ctx.sessionManager);
		return Array.isArray(entries) ? entries : undefined;
	} catch {
		return undefined;
	}
}
