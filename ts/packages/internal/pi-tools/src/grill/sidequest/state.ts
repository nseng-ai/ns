import { GRILL_ASK_TOOL_NAME } from "@nseng-ai/pi/grill/surfaces";

import { GRILL_UI_KICKOFF_MARKERS } from "../progress.ts";
import type { GrillAskRemainingEstimate } from "../protocol.ts";
import type {
	ActiveSideQuest,
	GrillSidequestEvent,
	PendingGrillAsk,
	SidequestScanState,
	SidequestSessionManagerLike,
} from "./protocol.ts";

/** Canonical custom session-entry type for side-quest lifecycle events. Not sent to the LLM. */
export const GRILL_SIDEQUEST_EVENT_ENTRY_TYPE = "grill-sidequest";

/**
 * Pure reducer over the current session branch after its latest grill kickoff.
 * Ask/result state comes from grill_ask messages; quest state comes only from
 * valid v1 custom events. Presentation markers and result prose are ignored.
 */
export function scanGrillBranch(entries: readonly unknown[]): SidequestScanState {
	const kickoffIndex = latestGrillKickoffIndex(entries);
	if (kickoffIndex === undefined) return { grill: "none" };

	let answeredCount = 0;
	let hasEnded = false;
	let pendingAsk: PendingGrillAsk | undefined;
	let openQuests: ActiveSideQuest[] = [];

	for (let index = kickoffIndex + 1; index < entries.length; index += 1) {
		const entry = entries[index];
		const event = sideQuestEventFromEntry(entry);
		if (event?.event === "started") {
			const markEntryId = entryId(entry);
			if (markEntryId !== undefined) {
				openQuests.push({
					questId: event.questId,
					markEntryId,
					topic: event.topic,
					...(event.pendingAsk === undefined ? {} : { pendingAsk: event.pendingAsk }),
				});
			}
			continue;
		}
		if (event?.event === "closed") {
			openQuests = openQuests.filter((quest) => quest.questId !== event.questId);
			continue;
		}

		const ask = grillAskCallFromEntry(entry);
		if (ask !== undefined) {
			pendingAsk = ask;
			continue;
		}

		const result = grillAskResultFromEntry(entry);
		if (result === undefined) continue;
		switch (result.action) {
			case "answer":
				answeredCount += 1;
				if (matchesPendingAsk(pendingAsk, result.toolCallId)) pendingAsk = undefined;
				break;
			case "cancelled":
			case "ui-unavailable":
			case "invalid-tool-input":
				if (matchesPendingAsk(pendingAsk, result.toolCallId)) pendingAsk = undefined;
				break;
			case "end-grill":
				pendingAsk = undefined;
				hasEnded = true;
				break;
			case "status-request":
			case "side-quest":
			case "side-quest-refused":
				break;
		}
	}

	if (hasEnded) return { grill: "ended", answeredCount };

	const activeQuest = openQuests[openQuests.length - 1];
	return {
		grill: "active",
		answeredCount,
		...(pendingAsk === undefined ? {} : { pendingAsk }),
		...(activeQuest === undefined ? {} : { activeQuest }),
	};
}

/** Scan the current branch through a session manager, degrading to "none" on any read failure. */
export function scanGrillBranchFromSessionManager(
	sessionManager: SidequestSessionManagerLike | undefined,
): SidequestScanState {
	const entries = readBranchEntries(sessionManager);
	return entries === undefined ? { grill: "none" } : scanGrillBranch(entries);
}

export function readBranchEntries(
	sessionManager: SidequestSessionManagerLike | undefined,
): readonly unknown[] | undefined {
	if (sessionManager === undefined) return undefined;
	let branch: readonly unknown[];
	try {
		branch = sessionManager.getBranch();
	} catch {
		return undefined;
	}
	return Array.isArray(branch) ? branch : undefined;
}

/** Locate the canonical started-event entry for deferred mark labeling. */
export function findSideQuestStartEntryId(
	entries: readonly unknown[],
	questId: string,
): string | undefined {
	for (const entry of entries) {
		const event = sideQuestEventFromEntry(entry);
		if (event?.event !== "started" || event.questId !== questId) continue;
		const id = entryId(entry);
		if (id !== undefined) return id;
	}
	return undefined;
}

function latestGrillKickoffIndex(entries: readonly unknown[]): number | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const text = userMessageText(entries[index]);
		if (text === undefined) continue;
		if (GRILL_UI_KICKOFF_MARKERS.some((marker) => text.includes(marker))) return index;
	}
	return undefined;
}

function sideQuestEventFromEntry(entry: unknown): GrillSidequestEvent | undefined {
	if (!isRecord(entry) || entry.type !== "custom") return undefined;
	if (entry.customType !== GRILL_SIDEQUEST_EVENT_ENTRY_TYPE || !isRecord(entry.data)) {
		return undefined;
	}
	const data = entry.data;
	if (data.version !== 1 || typeof data.questId !== "string" || data.questId.length === 0) {
		return undefined;
	}
	if (data.event === "closed") {
		return { version: 1, event: "closed", questId: data.questId };
	}
	if (data.event !== "started" || typeof data.topic !== "string" || data.topic.length === 0) {
		return undefined;
	}
	const pendingAsk = narrowPendingAsk(data.pendingAsk);
	if (data.pendingAsk !== undefined && pendingAsk === undefined) return undefined;
	return {
		version: 1,
		event: "started",
		questId: data.questId,
		topic: data.topic,
		...(pendingAsk === undefined ? {} : { pendingAsk }),
	};
}

function grillAskCallFromEntry(entry: unknown): PendingGrillAsk | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
		return undefined;
	}
	for (const item of message.content) {
		if (!isRecord(item) || item.type !== "toolCall" || item.name !== GRILL_ASK_TOOL_NAME) continue;
		if (!isRecord(item.arguments) || typeof item.arguments.question !== "string") continue;
		const question = item.arguments.question.trim();
		if (question.length === 0) continue;
		const estimatedRemaining = narrowRemainingEstimate(item.arguments.estimatedRemaining);
		return {
			question,
			...(typeof item.id === "string" ? { toolCallId: item.id } : {}),
			...(estimatedRemaining === undefined ? {} : { estimatedRemaining }),
		};
	}
	return undefined;
}

interface GrillAskResultSnapshot {
	action:
		| "answer"
		| "end-grill"
		| "status-request"
		| "side-quest"
		| "side-quest-refused"
		| "cancelled"
		| "ui-unavailable"
		| "invalid-tool-input";
	toolCallId?: string;
}

function grillAskResultFromEntry(entry: unknown): GrillAskResultSnapshot | undefined {
	const message = messageFromEntry(entry);
	if (
		!isRecord(message) ||
		message.role !== "toolResult" ||
		message.toolName !== GRILL_ASK_TOOL_NAME
	) {
		return undefined;
	}
	if (!isRecord(message.details) || !isGrillAskResultAction(message.details.action))
		return undefined;
	return {
		action: message.details.action,
		...(typeof message.toolCallId === "string" ? { toolCallId: message.toolCallId } : {}),
	};
}

function isGrillAskResultAction(value: unknown): value is GrillAskResultSnapshot["action"] {
	return (
		value === "answer" ||
		value === "end-grill" ||
		value === "status-request" ||
		value === "side-quest" ||
		value === "side-quest-refused" ||
		value === "cancelled" ||
		value === "ui-unavailable" ||
		value === "invalid-tool-input"
	);
}

function matchesPendingAsk(
	pendingAsk: PendingGrillAsk | undefined,
	resultToolCallId: string | undefined,
): boolean {
	if (pendingAsk === undefined) return false;
	if (resultToolCallId === undefined) return true;
	if (pendingAsk.toolCallId === undefined) return false;
	return pendingAsk.toolCallId === resultToolCallId;
}

function narrowPendingAsk(value: unknown): PendingGrillAsk | undefined {
	if (!isRecord(value) || typeof value.question !== "string" || value.question.length === 0) {
		return undefined;
	}
	const estimatedRemaining = narrowRemainingEstimate(value.estimatedRemaining);
	if (value.estimatedRemaining !== undefined && estimatedRemaining === undefined) return undefined;
	if (value.toolCallId !== undefined && typeof value.toolCallId !== "string") return undefined;
	return {
		question: value.question,
		...(typeof value.toolCallId === "string" ? { toolCallId: value.toolCallId } : {}),
		...(estimatedRemaining === undefined ? {} : { estimatedRemaining }),
	};
}

function narrowRemainingEstimate(value: unknown): GrillAskRemainingEstimate | undefined {
	if (!isRecord(value)) return undefined;
	if (value.kind === "exact" && isNonNegativeInteger(value.count)) {
		if (value.basis !== undefined && typeof value.basis !== "string") return undefined;
		return {
			kind: "exact",
			count: value.count,
			...(typeof value.basis === "string" ? { basis: value.basis } : {}),
		};
	}
	if (
		value.kind === "range" &&
		isNonNegativeInteger(value.min) &&
		isNonNegativeInteger(value.max) &&
		value.min <= value.max &&
		typeof value.basis === "string" &&
		value.basis.length > 0
	) {
		return { kind: "range", min: value.min, max: value.max, basis: value.basis };
	}
	if (value.kind === "unknown" && typeof value.basis === "string" && value.basis.length > 0) {
		return { kind: "unknown", basis: value.basis };
	}
	return undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function entryId(entry: unknown): string | undefined {
	return isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
}

function userMessageText(entry: unknown): string | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "user") return undefined;
	return textFromContent(message.content);
}

function messageFromEntry(entry: unknown): unknown {
	if (!isRecord(entry) || entry.type !== "message") return undefined;
	return entry.message;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const textParts: string[] = [];
	for (const item of content) {
		if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
			textParts.push(item.text);
		}
	}
	return textParts.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
