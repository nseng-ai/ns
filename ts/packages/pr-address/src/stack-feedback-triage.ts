import { z } from "zod";

import type { PRDiscussionComment } from "./gateways.ts";

export const DIRECT_REQUEST_MARKERS = ["please", "can you", "could you", "should", "needs", "need to", "fix", "update", "question"] as const;
export const DISCUSSION_TRIAGE_HINTS = ["automation", "human_like", "needs_agent_review"] as const;
export const DISCUSSION_TRIAGE_REASONS = [
	"vercel_status",
	"graphite_status",
	"roaster_summary",
	"github_actions_status",
	"bot_status",
	"human_like",
	"direct_request_possible",
	"uncertain",
] as const;

export const discussionTriageHintSchema = z.enum(DISCUSSION_TRIAGE_HINTS);
export const discussionTriageReasonSchema = z.enum(DISCUSSION_TRIAGE_REASONS);

export const stackDiscussionTriageItemSchema = z.looseObject({
	comment_id: z.number().int(),
	author: z.string(),
	classification_hint: discussionTriageHintSchema,
	reason: discussionTriageReasonSchema,
	body_locator: z.unknown(),
});

export const stackDiscussionTriageSummarySchema = z.looseObject({
	automation_like: z.number().int().default(0),
	human_like: z.number().int().default(0),
	needs_agent_review: z.number().int().default(0),
	by_reason: z.record(z.string(), z.number().int()).default({}),
	items: z.array(stackDiscussionTriageItemSchema).default([]),
});

export type DiscussionTriageHint = z.infer<typeof discussionTriageHintSchema>;
export type DiscussionTriageReason = z.infer<typeof discussionTriageReasonSchema>;
export type StackDiscussionTriageItem = z.infer<typeof stackDiscussionTriageItemSchema>;
export type StackDiscussionTriageSummary = z.infer<typeof stackDiscussionTriageSummarySchema>;

export function buildDiscussionTriageSummary(options: {
	manifestComments: ReadonlyArray<{ comment_id: number; body_locator: unknown }>;
	discussionComments: readonly PRDiscussionComment[];
}): StackDiscussionTriageSummary {
	const commentsById = new Map(options.discussionComments.map((comment) => [comment.id, comment]));
	const items: StackDiscussionTriageItem[] = [];
	for (const manifestComment of options.manifestComments) {
		const comment = commentsById.get(manifestComment.comment_id);
		if (comment === undefined) continue;
		const [hint, reason] = discussionTriageHint(comment.author.toLowerCase(), comment.body.toLowerCase());
		items.push({ comment_id: comment.id, author: comment.author, classification_hint: hint, reason, body_locator: manifestComment.body_locator });
	}
	return triageSummary(items);
}

function discussionTriageHint(author: string, body: string): [DiscussionTriageHint, DiscussionTriageReason] {
	if (author === "vercel[bot]" || body.includes("[vc]:")) return ["automation", "vercel_status"];
	if (body.includes("app.graphite.com") || body.includes("not mergeable via github")) return ["automation", "graphite_status"];
	if (body.includes("<!-- roaster:")) return ["automation", "roaster_summary"];
	if (author === "github-actions[bot]" || body.includes("github actions")) return ["automation", "github_actions_status"];
	if (DIRECT_REQUEST_MARKERS.some((marker) => body.includes(marker))) return ["needs_agent_review", "direct_request_possible"];
	if (author.endsWith("[bot]")) return ["automation", "bot_status"];
	if (author !== "") return ["human_like", "human_like"];
	return ["needs_agent_review", "uncertain"];
}

export function triageSummary(items: readonly StackDiscussionTriageItem[]): StackDiscussionTriageSummary {
	const byReason: Record<string, number> = {};
	for (const item of items) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
	return {
		automation_like: items.filter(isAutomationDiscussionTriageItem).length,
		human_like: items.filter((item) => item.classification_hint === "human_like").length,
		needs_agent_review: items.filter((item) => item.classification_hint === "needs_agent_review").length,
		by_reason: byReason,
		items: [...items],
	};
}

export function isAutomationDiscussionTriageItem(item: StackDiscussionTriageItem): boolean {
	return item.classification_hint === "automation";
}
