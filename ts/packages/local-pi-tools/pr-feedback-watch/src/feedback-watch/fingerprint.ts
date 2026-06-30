import type { PrFeedbackDownloadData } from "../feedback-download.ts";
import { finiteNumberField } from "@sdl/core/primitives";
import { isRecord, stringField } from "@sdl/pi/runtime/primitives";

import { TOP_LEVEL_BOT_DISCUSSION_AUTHORS } from "./constants.ts";
import type {
	FeedbackFingerprint,
	FeedbackFingerprintItem,
	FeedbackItemKey,
	FilteredFeedbackItems,
	IgnoredFeedbackItem,
} from "./model.ts";

export function feedbackItemKeyFromDownload(data: PrFeedbackDownloadData): FeedbackItemKey[] {
	if (!data.found) return [];
	const prNumber = data.target.pr_number ?? "unknown";
	const total =
		data.counts.includedReviewThreads +
		data.counts.includedReviews +
		data.counts.includedDiscussionComments;
	if (total === 0) return [];
	return [{ kind: "download", key: `download-feedback:${prNumber}:${total}` }];
}

export function feedbackItemKeysFromFingerprint(
	items: readonly FeedbackFingerprintItem[],
): FeedbackItemKey[] {
	return items.map((item) => ({
		kind: item.kind === "review_comment" ? "thread_comment" : item.kind,
		key: `${item.kind}:${item.id}:${item.updatedAt ?? ""}`,
		...(item.author === undefined ? {} : { author: item.author }),
		...(item.path === undefined ? {} : { path: item.path }),
		...(item.line === undefined ? {} : { line: item.line }),
	}));
}

export function parseDiscussionCommentFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id");
		if (id === undefined) continue;
		const updatedAt = stringField(item, "updated_at") ?? stringField(item, "created_at");
		const author = authorFromValue(item);
		items.push({
			kind: "discussion_comment",
			id,
			...(updatedAt === undefined ? {} : { updatedAt }),
			...(author === undefined ? {} : { author }),
		});
	}
	return items;
}

export function parseReviewFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id") ?? stringField(item, "node_id");
		if (id === undefined) continue;
		const updatedAt = stringField(item, "submitted_at");
		const author = authorFromValue(item);
		const state = stringField(item, "state");
		const commitId = stringField(item, "commit_id");
		items.push({
			kind: "review",
			id,
			...(updatedAt === undefined ? {} : { updatedAt }),
			...(author === undefined ? {} : { author }),
			...(state === undefined ? {} : { state }),
			...(commitId === undefined ? {} : { commitId }),
		});
	}
	return items;
}

export function parseReviewCommentFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id");
		if (id === undefined) continue;
		const updatedAt = stringField(item, "updated_at") ?? stringField(item, "created_at");
		const author = authorFromValue(item);
		const path = stringField(item, "path");
		const line = finiteNumberField(item, "line");
		const reviewId = idField(item, "pull_request_review_id");
		const inReplyToId = idField(item, "in_reply_to_id");
		items.push({
			kind: "review_comment",
			id,
			...(updatedAt === undefined ? {} : { updatedAt }),
			...(author === undefined ? {} : { author }),
			...(path === undefined ? {} : { path }),
			...(line === undefined ? {} : { line }),
			...(reviewId === undefined ? {} : { reviewId }),
			...(inReplyToId === undefined ? {} : { inReplyToId }),
		});
	}
	return items;
}

export function buildFeedbackFingerprint(
	items: readonly FeedbackFingerprintItem[],
	fetchedAt = new Date().toISOString(),
): FeedbackFingerprint {
	const copied = [...items];
	const latestTimestamp = maxFingerprintTimestamp(copied);
	return {
		key: fingerprintKeyFromOwnedItems(copied),
		items: copied,
		...(latestTimestamp === undefined ? {} : { latestTimestamp }),
		fetchedAt,
	};
}

export function fingerprintKeyFromItems(items: readonly FeedbackFingerprintItem[]): string {
	return fingerprintKeyFromOwnedItems([...items]);
}

function fingerprintKeyFromOwnedItems(items: FeedbackFingerprintItem[]): string {
	return items
		.sort(compareFingerprintItems)
		.map((item) =>
			[
				item.kind,
				item.id,
				item.updatedAt ?? "",
				item.author ?? "",
				item.path ?? "",
				item.line === undefined ? "" : String(item.line),
				item.state ?? "",
				item.commitId ?? "",
				item.reviewId ?? "",
				item.inReplyToId ?? "",
			].join(":"),
		)
		.join("\n");
}

export function maxFingerprintTimestamp(
	items: readonly FeedbackFingerprintItem[],
): string | undefined {
	let latest: string | undefined;
	for (const item of items) {
		if (item.updatedAt === undefined) continue;
		if (latest === undefined || item.updatedAt > latest) latest = item.updatedAt;
	}
	return latest;
}

export function filterIgnoredFeedback(
	items: readonly FeedbackItemKey[],
	options: { currentUserLogin?: string } = {},
): FilteredFeedbackItems {
	const actionableTriggerItems: FeedbackItemKey[] = [];
	const ignoredItems: IgnoredFeedbackItem[] = [];
	for (const item of items) {
		if (options.currentUserLogin !== undefined && item.author === options.currentUserLogin) {
			ignoredItems.push({ item, reason: "current_user" });
			continue;
		}
		if (
			item.kind === "discussion_comment" &&
			item.author !== undefined &&
			TOP_LEVEL_BOT_DISCUSSION_AUTHORS.has(item.author)
		) {
			ignoredItems.push({ item, reason: "status_bot" });
			continue;
		}
		actionableTriggerItems.push(item);
	}
	return { actionableTriggerItems, ignoredItems };
}
function compareFingerprintItems(
	left: FeedbackFingerprintItem,
	right: FeedbackFingerprintItem,
): number {
	return fingerprintSortKey(left).localeCompare(fingerprintSortKey(right));
}

function fingerprintSortKey(item: FeedbackFingerprintItem): string {
	return [
		item.kind,
		item.id,
		item.updatedAt ?? "",
		item.path ?? "",
		item.line === undefined ? "" : String(item.line),
	].join(":");
}

function authorFromValue(value: Record<string, unknown>): string | undefined {
	const author = stringField(value, "author");
	if (author !== undefined) return author;
	if (!isRecord(value.user)) return undefined;
	return stringField(value.user, "login");
}

function idField(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	if (typeof field === "number" && Number.isFinite(field)) return String(field);
	return typeof field === "string" ? field : undefined;
}
