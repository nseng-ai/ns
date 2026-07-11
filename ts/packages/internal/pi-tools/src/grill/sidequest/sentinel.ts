import type { GrillAskToolContext, ToolResult } from "../protocol.ts";
import { textResult, type GrillAskDetails } from "../result.ts";
import { buildSideQuestRefusedText, buildSideQuestStartedText } from "./prompts.ts";
import type { SideQuestStartedInfo } from "./protocol.ts";
import { scanGrillBranchFromSessionManager } from "./state.ts";

const SIDE_QUEST_SENTINEL_PATTERN = /^(?:sq|sidequest)\s*:\s*(.+)/is;

/** Parse the freeform side-quest gesture (`sq: <topic>` / `sidequest: <topic>`). */
export function parseSideQuestSentinel(answer: string): string | undefined {
	const match = SIDE_QUEST_SENTINEL_PATTERN.exec(answer.trim());
	const topic = match?.[1]?.trim();
	return topic === undefined || topic.length === 0 ? undefined : topic;
}

export interface ResolveFreeformSideQuestOptions {
	answer: string;
	question: string;
	ctx: GrillAskToolContext;
	toolCallId?: string;
	onSideQuestStarted?: (info: SideQuestStartedInfo) => void;
}

/**
 * Give a freeform answer a chance to start a side quest. Returns `undefined`
 * when the answer is not a side-quest sentinel so callers fall through to the
 * normal freeform-answer path; otherwise returns the started or refused tool
 * result. Single-level: a second quest while one is active is refused.
 */
export function resolveFreeformSideQuest(
	options: ResolveFreeformSideQuestOptions,
): ToolResult<GrillAskDetails> | undefined {
	const topic = parseSideQuestSentinel(options.answer);
	if (topic === undefined) return undefined;

	const scan = scanGrillBranchFromSessionManager(options.ctx.sessionManager);
	const activeQuest = scan.grill === "active" ? scan.activeQuest : undefined;
	if (activeQuest !== undefined) {
		return sideQuestRefusedResult(options.question, topic, activeQuest.topic);
	}

	if (options.toolCallId !== undefined) {
		options.onSideQuestStarted?.({
			toolCallId: options.toolCallId,
			topic,
			question: options.question,
		});
	}
	return sideQuestStartedResult(options.question, topic);
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
