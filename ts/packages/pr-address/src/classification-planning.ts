import { z } from "zod";

import {
	type ClassifiedDiscussionCommentItem,
	type ClassifiedReviewItem,
	type ClassifiedThreadItem,
	type FeedbackClassificationPacket,
	type FeedbackManifestView,
} from "./classification-shared.ts";
import { validateFeedbackClassificationArtifacts, type FeedbackClassificationValidationResult } from "./classification-validation.ts";
import {
	type BodyLocator,
	type DiscussionCommentManifestItem,
	type ReviewManifestItem,
	type ThreadManifestItem,
} from "./feedback-manifest-contracts.ts";
import {
	ACTION_COMPLEXITIES,
	APPROVAL_REQUIRED_COMPLEXITIES,
	INFORMATIONAL_THREAD_DECISIONS,
	feedbackPlanDiscussionActionItemSchema,
	feedbackPlanDiscussionInformationalItemSchema,
	feedbackPlanResultSchema,
	feedbackPlanReviewActionItemSchema,
	feedbackPlanReviewInformationalItemSchema,
	feedbackPlanThreadActionItemSchema,
	feedbackPlanThreadInformationalItemSchema,
	type ActionComplexity,
	type FeedbackPlanActionItem,
	type FeedbackPlanBatch,
	type FeedbackPlanCounts,
	type FeedbackPlanCoveredComment,
	type FeedbackPlanDiscussionActionItem,
	type FeedbackPlanDiscussionInformationalItem,
	type FeedbackPlanInformationalItem,
	type FeedbackPlanReviewActionItem,
	type FeedbackPlanResult,
	type FeedbackPlanReviewInformationalItem,
	type FeedbackPlanThreadActionItem,
	type FeedbackPlanThreadInformationalItem,
	type PlanSourceKind,
} from "./feedback-plan-contracts.ts";

type FeedbackPlanItem = FeedbackPlanActionItem | FeedbackPlanInformationalItem;

interface PlanSourceItemFields {
	review_id?: string | null;
	review_state?: string | null;
	submitted_at?: string | null;
	thread_id?: string | null;
	discussion_comment_id?: number | null;
	covered_comment_ids?: number[];
	covered_comments?: FeedbackPlanCoveredComment[];
	body_locator?: BodyLocator | null;
	thread_item_pointer?: string | null;
	path?: string | null;
	line?: number | null;
	start_line?: number | null;
	is_outdated?: boolean | null;
	author?: string | null;
	url?: string | null;
}

export type FeedbackPlanningResult = FeedbackPlanResult;

interface ClassifiedLookup {
	reviews: Map<string, ClassifiedReviewItem>;
	threads: Map<string, ClassifiedThreadItem>;
	comments: Map<number, ClassifiedDiscussionCommentItem>;
}

export function planFeedback(input: { manifest: unknown; classification: unknown }): FeedbackPlanningResult {
	const artifacts = validateFeedbackClassificationArtifacts(input);
	const validation = artifacts.validation;
	if (!validation.valid) {
		return {
			valid: false,
			manifest_kind: validation.manifest_kind,
			pr_number: validation.pr_number,
			payload_path: validation.payload_path,
			validation,
			counts: null,
			batches: [],
			informational: [],
			warnings: [],
		};
	}

	if (artifacts.manifestView === null || artifacts.classificationPacket === null) {
		throw new Error("Validated feedback classification has null manifest view or packet; this is a programmer error.");
	}

	const view = artifacts.manifestView;
	const lookup = classifiedLookup(artifacts.classificationPacket);
	const { actions, informational } = partitionPlanItems(view, lookup);
	const batches = batchesForActions(actions);
	const result: FeedbackPlanResult = {
		valid: true,
		manifest_kind: view.kind,
		pr_number: view.prNumber,
		payload_path: view.payloadPath,
		validation,
		counts: planCounts(actions, informational, batches),
		batches,
		informational,
		warnings: planningWarnings(view),
	};
	return result;
}

function classifiedLookup(packet: FeedbackClassificationPacket): ClassifiedLookup {
	return {
		reviews: new Map(packet.reviews.map((item) => [item.review_id, item])),
		threads: new Map(packet.review_threads.map((item) => [item.thread_id, item])),
		comments: new Map(packet.discussion_comments.map((item) => [item.comment_id, item])),
	};
}

interface PlanPartition {
	actions: FeedbackPlanActionItem[];
	informational: FeedbackPlanInformationalItem[];
}

function partitionPlanItems(view: FeedbackManifestView, classified: ClassifiedLookup): PlanPartition {
	const actions: FeedbackPlanActionItem[] = [];
	const informational: FeedbackPlanInformationalItem[] = [];
	for (const review of view.reviews) {
		const item = classified.reviews.get(review.id);
		if (item?.disposition === "actionable") actions.push(reviewActionItem(review, item));
		else if (item?.disposition === "informational") informational.push(reviewInformationalItem(review, item));
	}
	for (const thread of view.requiredThreads) {
		const item = classified.threads.get(thread.thread_id);
		if (item?.disposition === "actionable") actions.push(threadActionItem(thread, item));
		else if (item?.disposition === "informational") informational.push(threadInformationalItem(thread, item));
	}
	for (const comment of view.discussionComments) {
		const item = classified.comments.get(comment.comment_id);
		if (item?.disposition === "actionable") actions.push(discussionActionItem(comment, item));
		else if (item?.disposition === "informational") informational.push(discussionInformationalItem(comment, item));
	}
	return { actions, informational };
}

function reviewSourceFields(review: ReviewManifestItem): PlanSourceItemFields {
	return {
		review_id: review.id,
		review_state: review.state,
		submitted_at: review.submitted_at,
		body_locator: review.body_locator,
		author: review.author,
	};
}

function threadSourceFields(thread: ThreadManifestItem, item: ClassifiedThreadItem): PlanSourceItemFields {
	const coveredComments = coveredThreadComments(thread, item);
	const firstComment = coveredComments[0] ?? null;
	return {
		thread_id: thread.thread_id,
		covered_comment_ids: coveredComments.map((comment) => comment.comment_id),
		covered_comments: coveredComments,
		body_locator: firstComment?.body_locator ?? null,
		thread_item_pointer: thread.item_pointer,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_outdated: thread.is_outdated,
		author: firstComment?.author ?? null,
	};
}

function discussionSourceFields(comment: DiscussionCommentManifestItem): PlanSourceItemFields {
	return {
		discussion_comment_id: comment.comment_id,
		body_locator: comment.body_locator,
		author: comment.author,
		url: comment.url,
	};
}

function reviewActionItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewActionItem {
	const result: FeedbackPlanReviewActionItem = {
		...planSourceItemBase("review", item.summary, reviewSourceFields(review)),
		source_kind: "review",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	};
	return result;
}

function threadActionItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadActionItem {
	const result: FeedbackPlanThreadActionItem = {
		...planSourceItemBase("review_thread", item.summary, threadSourceFields(thread, item)),
		source_kind: "review_thread",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	};
	return result;
}

function discussionActionItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionActionItem {
	const result: FeedbackPlanDiscussionActionItem = {
		...planSourceItemBase("discussion_comment", item.summary, discussionSourceFields(comment)),
		source_kind: "discussion_comment",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: false,
		needs_reply: item.needs_reply,
	};
	return result;
}

function reviewInformationalItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewInformationalItem {
	const result: FeedbackPlanReviewInformationalItem = {
		...planSourceItemBase("review", item.summary, reviewSourceFields(review)),
		source_kind: "review",
		informational_reason: item.informational_reason,
		user_decision_required: false,
		allowed_decisions: [],
	};
	return result;
}

function threadInformationalItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadInformationalItem {
	const result: FeedbackPlanThreadInformationalItem = {
		...planSourceItemBase("review_thread", item.summary, threadSourceFields(thread, item)),
		source_kind: "review_thread",
		informational_reason: item.informational_reason,
		user_decision_required: true,
		allowed_decisions: [...INFORMATIONAL_THREAD_DECISIONS],
	};
	return result;
}

function discussionInformationalItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionInformationalItem {
	const result: FeedbackPlanDiscussionInformationalItem = {
		...planSourceItemBase("discussion_comment", item.summary, discussionSourceFields(comment)),
		source_kind: "discussion_comment",
		informational_reason: item.informational_reason,
		user_decision_required: false,
		allowed_decisions: [],
	};
	return result;
}

function planSourceItemBase(sourceKind: PlanSourceKind, summary: string, fields: PlanSourceItemFields): { source_kind: PlanSourceKind; summary: string } & Required<PlanSourceItemFields> {
	return {
		source_kind: sourceKind,
		summary,
		review_id: fields.review_id ?? null,
		review_state: fields.review_state ?? null,
		submitted_at: fields.submitted_at ?? null,
		thread_id: fields.thread_id ?? null,
		discussion_comment_id: fields.discussion_comment_id ?? null,
		covered_comment_ids: fields.covered_comment_ids ?? [],
		covered_comments: fields.covered_comments ?? [],
		body_locator: fields.body_locator ?? null,
		thread_item_pointer: fields.thread_item_pointer ?? null,
		path: fields.path ?? null,
		line: fields.line ?? null,
		start_line: fields.start_line ?? null,
		is_outdated: fields.is_outdated ?? null,
		author: fields.author ?? null,
		url: fields.url ?? null,
	};
}

function coveredThreadComments(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanCoveredComment[] {
	const coveredIds = new Set(item.covered_comments.map((comment) => comment.comment_id));
	return thread.comments.filter((comment) => coveredIds.has(comment.id)).map((comment) => ({
		comment_id: comment.id,
		author: comment.author,
		path: comment.path,
		line: comment.line,
		start_line: comment.start_line,
		body_locator: comment.body_locator,
	}));
}

function batchesForActions(actions: FeedbackPlanActionItem[]): FeedbackPlanBatch[] {
	const byComplexity = new Map<ActionComplexity, FeedbackPlanActionItem[]>(ACTION_COMPLEXITIES.map((complexity) => [complexity, []]));
	for (const item of actions) byComplexity.get(item.complexity)?.push(item);
	const batches: FeedbackPlanBatch[] = [];
	for (const complexity of ACTION_COMPLEXITIES) {
		const items = byComplexity.get(complexity) ?? [];
		if (items.length > 0) {
			batches.push({
				batch_id: complexity,
				complexity,
				approval_required: APPROVAL_REQUIRED_COMPLEXITIES.has(complexity),
				items,
			});
		}
	}
	return batches;
}

function requiredActionComplexity(complexity: ActionComplexity | null): ActionComplexity {
	if (complexity !== null) return complexity;
	throw new Error("Validated actionable feedback item is missing complexity.");
}

function planCounts(actions: FeedbackPlanActionItem[], informational: FeedbackPlanInformationalItem[], batches: FeedbackPlanBatch[]): FeedbackPlanCounts {
	const actionCounts = sourceKindCounts(actions);
	const informationalCounts = sourceKindCounts(informational);
	return {
		actionable_items: actions.length,
		informational_items: informational.length,
		batches: batches.length,
		approval_required_batches: batches.filter((batch) => batch.approval_required).length,
		actionable_reviews: actionCounts.review,
		actionable_review_threads: actionCounts.review_thread,
		actionable_discussion_comments: actionCounts.discussion_comment,
		informational_reviews: informationalCounts.review,
		informational_review_threads: informationalCounts.review_thread,
		informational_discussion_comments: informationalCounts.discussion_comment,
	};
}

function sourceKindCounts(items: readonly FeedbackPlanItem[]): Record<PlanSourceKind, number> {
	const counts: Record<PlanSourceKind, number> = { review: 0, review_thread: 0, discussion_comment: 0 };
	for (const item of items) counts[item.source_kind] += 1;
	return counts;
}

function planningWarnings(view: FeedbackManifestView): string[] {
	if (view.kind === "prepare_run" && view.prNumber === null && view.reviews.length === 0 && view.requiredThreads.length === 0 && view.discussionComments.length === 0) {
		return ["prepare-run manifest has found=false; plan is empty."];
	}
	return [];
}
