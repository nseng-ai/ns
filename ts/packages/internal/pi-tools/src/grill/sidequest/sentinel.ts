import type { GrillAskToolContext, ToolResult } from "../protocol.ts";
import { textResult, type GrillAskDetails } from "../result.ts";
import { buildSideQuestRefusedText, buildSideQuestStartedText } from "./prompts.ts";
import type { GrillSidequestCapability, PendingGrillAsk } from "./protocol.ts";
import { scanGrillBranchFromSessionManager } from "./state.ts";

const SIDE_QUEST_SENTINEL_PATTERN = /^(?:sq|sidequest)\s*:\s*(.+)/is;

/** Parse the freeform side-quest gesture (`sq: <topic>` / `sidequest: <topic>`). */
export function parseSideQuestSentinel(answer: string): string | undefined {
	const match = SIDE_QUEST_SENTINEL_PATTERN.exec(answer.trim());
	const topic = match?.[1]?.trim();
	return topic === undefined || topic.length === 0 ? undefined : topic;
}

export interface ResolveSideQuestOptions {
	topic: string;
	pendingAsk: PendingGrillAsk;
	ctx: GrillAskToolContext;
	capability: GrillSidequestCapability;
}

export interface ResolveFreeformSideQuestOptions extends Omit<ResolveSideQuestOptions, "topic"> {
	answer: string;
}

/**
 * Give a freeform answer a chance to start a side quest. Returns `undefined`
 * when the answer is not a side-quest sentinel so callers fall through to the
 * normal freeform-answer path. Callers without the capability bypass this
 * function, making sentinel-looking text an ordinary freeform answer.
 */
export function resolveFreeformSideQuest(
	options: ResolveFreeformSideQuestOptions,
): ToolResult<GrillAskDetails> | undefined {
	const topic = parseSideQuestSentinel(options.answer);
	if (topic === undefined) return undefined;
	return resolveSideQuest({
		topic,
		pendingAsk: options.pendingAsk,
		ctx: options.ctx,
		capability: options.capability,
	});
}

/** Start a side quest from a dedicated UI path. Single-level: an active quest refuses another. */
export function resolveSideQuest(options: ResolveSideQuestOptions): ToolResult<GrillAskDetails> {
	const topic = options.topic.trim();
	const scan = scanGrillBranchFromSessionManager(options.ctx.sessionManager);
	const activeQuest = scan.grill === "active" ? scan.activeQuest : undefined;
	if (activeQuest !== undefined) {
		return sideQuestRefusedResult(options.pendingAsk.question, topic, activeQuest.topic);
	}

	options.capability.startSideQuest(topic, options.pendingAsk);
	return sideQuestStartedResult(options.pendingAsk.question, topic);
}

export function sideQuestStartedResult(
	question: string,
	topic: string,
): ToolResult<GrillAskDetails> {
	return textResult(buildSideQuestStartedText(topic, question), {
		action: "side-quest",
		question,
		topic,
	});
}

export function sideQuestRefusedResult(
	question: string,
	topic: string,
	activeTopic: string,
): ToolResult<GrillAskDetails> {
	return textResult(buildSideQuestRefusedText(topic, activeTopic), {
		action: "side-quest-refused",
		question,
		topic,
	});
}
