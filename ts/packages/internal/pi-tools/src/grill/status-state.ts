import { GRILL_ASK_TOOL_NAME } from "@nseng-ai/pi/grill/surfaces";

import { GRILL_UI_KICKOFF_MARKERS } from "./progress.ts";
import type { GrillAskRemainingEstimate } from "./protocol.ts";
import type {
	GrillStatusSessionManagerLike,
	GrillStatusState,
	PendingGrillAsk,
} from "./status-protocol.ts";

/** Reconstruct the current grill from ordinary message history after its latest kickoff. */
export function scanGrillBranch(entries: readonly unknown[]): GrillStatusState {
	const kickoffIndex = latestGrillKickoffIndex(entries);
	if (kickoffIndex === undefined) return { grill: "none" };

	let answeredCount = 0;
	let hasEnded = false;
	let remainingEstimate: GrillAskRemainingEstimate | undefined;
	let pendingAsk: PendingGrillAsk | undefined;

	for (let index = kickoffIndex + 1; index < entries.length; index += 1) {
		const entry = entries[index];
		const ask = grillAskCallFromEntry(entry);
		if (ask !== undefined) {
			remainingEstimate = ask.estimatedRemaining;
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
				break;
		}
	}

	if (hasEnded || (pendingAsk === undefined && isRemainingEstimateExhausted(remainingEstimate))) {
		return { grill: "ended", answeredCount };
	}
	return {
		grill: "active",
		answeredCount,
		...(remainingEstimate === undefined ? {} : { remainingEstimate }),
		...(pendingAsk === undefined ? {} : { pendingAsk }),
	};
}

/** Scan through a session manager, degrading to no active grill on malformed data or read failure. */
export function scanGrillBranchFromSessionManager(
	sessionManager: GrillStatusSessionManagerLike | undefined,
): GrillStatusState {
	if (sessionManager === undefined) return { grill: "none" };
	try {
		const entries = sessionManager.getBranch();
		return Array.isArray(entries) ? scanGrillBranch(entries) : { grill: "none" };
	} catch {
		return { grill: "none" };
	}
}

function latestGrillKickoffIndex(entries: readonly unknown[]): number | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const text = userMessageText(entries[index]);
		if (text !== undefined && GRILL_UI_KICKOFF_MARKERS.some((marker) => text.includes(marker))) {
			return index;
		}
	}
	return undefined;
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
		message.toolName !== GRILL_ASK_TOOL_NAME ||
		!isRecord(message.details) ||
		!isGrillAskResultAction(message.details.action)
	) {
		return undefined;
	}
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
	return pendingAsk.toolCallId === resultToolCallId;
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

function isRemainingEstimateExhausted(estimate: GrillAskRemainingEstimate | undefined): boolean {
	if (estimate === undefined) return false;
	if (estimate.kind === "exact") return estimate.count === 0;
	if (estimate.kind === "range") return estimate.max === 0;
	return false;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
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
