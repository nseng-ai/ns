import { GRILL_ASK_TOOL_NAME } from "@nseng-ai/pi/grill/surfaces";

import { GRILL_UI_KICKOFF_MARKERS } from "../progress.ts";
import type { GrillAskRemainingEstimate } from "../protocol.ts";
import {
	GRILL_SIDEQUEST_KICKOFF_MARKER_CLOSE,
	GRILL_SIDEQUEST_KICKOFF_MARKER_OPEN,
} from "./prompts.ts";
import type {
	ActiveSideQuest,
	GrillSidequestLatestAsk,
	SidequestScanState,
	SidequestSessionManagerLike,
} from "./protocol.ts";

/** Custom session-entry type that closes a side quest. Not sent to the LLM. */
export const GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE = "grill-sidequest";

/** Correlation key a closure entry's `data.returned` must carry to close a quest. */
export function sideQuestClosureKey(quest: ActiveSideQuest): string {
	return quest.toolCallId ?? quest.markEntryId;
}

/**
 * Pure scanner over the current session branch. All quest state derives from
 * session entries — a return parks the leaf at the mark with a closure entry
 * after it, and jumping before the mark drops the stamp off the branch — so
 * there is no hidden runtime state to corrupt or restore.
 */
export function scanGrillBranch(entries: readonly unknown[]): SidequestScanState {
	const kickoffIndex = latestGrillKickoffIndex(entries);
	if (kickoffIndex === undefined) return { grill: "none" };

	let answeredCount = 0;
	let hasEnded = false;
	let latestAsk: GrillSidequestLatestAsk | undefined;
	let openQuests: ActiveSideQuest[] = [];

	for (let index = kickoffIndex + 1; index < entries.length; index += 1) {
		const entry = entries[index];

		const closureKey = closedQuestKey(entry);
		if (closureKey !== undefined) {
			openQuests = openQuests.filter((quest) => sideQuestClosureKey(quest) !== closureKey);
			continue;
		}

		const ask = grillAskCallFromEntry(entry);
		if (ask !== undefined) {
			latestAsk = ask;
			continue;
		}

		const commandQuest = commandQuestFromEntry(entry, latestAsk);
		if (commandQuest !== undefined) {
			openQuests.push(commandQuest);
			continue;
		}

		const details = grillAskResultDetails(entry);
		if (details === undefined) continue;
		if (details.action === "answer") answeredCount += 1;
		if (details.action === "end-grill") hasEnded = true;
		if (details.action === "side-quest") {
			const stampedQuest = stampedQuestFromEntry(entry, details);
			if (stampedQuest !== undefined) openQuests.push(stampedQuest);
		}
	}

	if (hasEnded) return { grill: "ended", answeredCount };

	const activeQuest = openQuests[openQuests.length - 1];
	return {
		grill: "active",
		answeredCount,
		...(latestAsk === undefined ? {} : { latestAsk }),
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

/** Locate the session entry id of the tool result for a given tool call, for deferred mark labeling. */
export function findToolResultEntryId(
	entries: readonly unknown[],
	toolCallId: string,
): string | undefined {
	for (const entry of entries) {
		if (!isRecord(entry) || typeof entry.id !== "string") continue;
		const message = messageFromEntry(entry);
		if (!isRecord(message) || message.role !== "toolResult") continue;
		if (message.toolCallId === toolCallId) return entry.id;
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

function closedQuestKey(entry: unknown): string | undefined {
	if (!isRecord(entry) || entry.type !== "custom") return undefined;
	if (entry.customType !== GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE) return undefined;
	if (!isRecord(entry.data) || typeof entry.data.returned !== "string") return undefined;
	return entry.data.returned;
}

function grillAskCallFromEntry(entry: unknown): GrillSidequestLatestAsk | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
		return undefined;
	}
	for (const item of message.content) {
		if (!isRecord(item) || item.type !== "toolCall" || item.name !== GRILL_ASK_TOOL_NAME) continue;
		const args = isRecord(item.arguments) ? item.arguments : {};
		if (typeof args.question !== "string") continue;
		const estimatedRemaining = narrowRemainingEstimate(args.estimatedRemaining);
		return {
			question: args.question,
			...(typeof item.id === "string" ? { toolCallId: item.id } : {}),
			...(estimatedRemaining === undefined ? {} : { estimatedRemaining }),
		};
	}
	return undefined;
}

function grillAskResultDetails(entry: unknown): Record<string, unknown> | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "toolResult") return undefined;
	if (message.toolName !== GRILL_ASK_TOOL_NAME) return undefined;
	return isRecord(message.details) ? message.details : undefined;
}

function stampedQuestFromEntry(
	entry: unknown,
	details: Record<string, unknown>,
): ActiveSideQuest | undefined {
	if (!isRecord(entry) || typeof entry.id !== "string") return undefined;
	if (typeof details.topic !== "string") return undefined;
	const message = messageFromEntry(entry);
	const toolCallId = isRecord(message) ? message.toolCallId : undefined;
	return {
		markEntryId: entry.id,
		...(typeof toolCallId === "string" ? { toolCallId } : {}),
		topic: details.topic,
		...(typeof details.question === "string" ? { pendingQuestion: details.question } : {}),
	};
}

function commandQuestFromEntry(
	entry: unknown,
	latestAsk: GrillSidequestLatestAsk | undefined,
): ActiveSideQuest | undefined {
	if (!isRecord(entry) || typeof entry.id !== "string") return undefined;
	const text = userMessageText(entry);
	if (text === undefined) return undefined;
	const openIndex = text.indexOf(GRILL_SIDEQUEST_KICKOFF_MARKER_OPEN);
	if (openIndex < 0) return undefined;
	const closeIndex = text.indexOf(GRILL_SIDEQUEST_KICKOFF_MARKER_CLOSE, openIndex);
	if (closeIndex < 0) return undefined;
	const topic = text
		.slice(openIndex + GRILL_SIDEQUEST_KICKOFF_MARKER_OPEN.length, closeIndex)
		.trim();
	if (topic.length === 0) return undefined;
	return {
		markEntryId: entry.id,
		topic,
		...(latestAsk === undefined ? {} : { pendingQuestion: latestAsk.question }),
	};
}

function narrowRemainingEstimate(value: unknown): GrillAskRemainingEstimate | undefined {
	if (!isRecord(value)) return undefined;
	if (value.kind === "exact" && typeof value.count === "number") {
		return {
			kind: "exact",
			count: value.count,
			...(typeof value.basis === "string" ? { basis: value.basis } : {}),
		};
	}
	if (
		value.kind === "range" &&
		typeof value.min === "number" &&
		typeof value.max === "number" &&
		typeof value.basis === "string"
	) {
		return { kind: "range", min: value.min, max: value.max, basis: value.basis };
	}
	if (value.kind === "unknown" && typeof value.basis === "string") {
		return { kind: "unknown", basis: value.basis };
	}
	return undefined;
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
