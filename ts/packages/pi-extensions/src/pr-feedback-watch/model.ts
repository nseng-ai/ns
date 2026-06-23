import type { GithubPrIdentity } from "@sdl/core/github-status";

import type { PrFeedbackDownloadData } from "../pr-feedback-download.ts";

export type FeedbackItemKind = "download" | "review" | "thread_comment" | "discussion_comment";
export type FeedbackFingerprintItemKind = "discussion_comment" | "review" | "review_comment";
export type WatchMode = "rest_fingerprint" | "heavy_fallback" | "stopped";
export type IgnoredFeedbackReason = "current_user" | "status_bot";

export interface FeedbackItemKey {
	kind: FeedbackItemKind;
	key: string;
	author: string | undefined;
	path?: string | undefined;
	line?: number | undefined;
	jsonPointer?: string | undefined;
	itemPointer?: string | undefined;
}

export interface IgnoredFeedbackItem {
	item: FeedbackItemKey;
	reason: IgnoredFeedbackReason;
}

export interface PrFeedbackWatchGithubPrIdentity extends GithubPrIdentity {
	url?: string | undefined;
}

export interface FeedbackFingerprintItem {
	kind: FeedbackFingerprintItemKind;
	id: string;
	updatedAt?: string | undefined;
	author?: string | undefined;
	path?: string | undefined;
	line?: number | undefined;
	state?: string | undefined;
	commitId?: string | undefined;
	reviewId?: string | undefined;
	inReplyToId?: string | undefined;
}

export interface FeedbackFingerprint {
	key: string;
	items: FeedbackFingerprintItem[];
	latestTimestamp?: string | undefined;
	fetchedAt: string;
}

export interface FilteredFeedbackItems {
	actionableTriggerItems: FeedbackItemKey[];
	ignoredItems: IgnoredFeedbackItem[];
}

export interface FeedbackSnapshot {
	data: PrFeedbackDownloadData;
	items: FeedbackItemKey[];
	ignoredItems: IgnoredFeedbackItem[];
	headRefOid?: string | undefined;
}

export interface WatchStatus {
	isEnabled: boolean;
	state: "stopped" | "active" | "polling" | "paused" | "dispatching" | "error";
	mode: WatchMode;
	prNumber?: number | undefined;
	branch?: string | undefined;
	intervalMs: number;
	seenCount: number;
	attemptedCount: number;
	queuedCount: number;
	lastPollAt?: string | undefined;
	lastRestPollAt?: string | undefined;
	lastHeavyCheckAt?: string | undefined;
	checkSummary?: PrCheckSummary | undefined;
	restFailures: number;
	lastError?: string | undefined;
}

export interface PrCheckSummary {
	totalCount: number;
	pendingCount: number;
	passCount: number;
	failCount: number;
}

export interface WatchEventEntry {
	version: 1;
	type: "baseline" | "detected" | "dispatched" | "ignored" | "stopped" | "config" | "error";
	branch: string | undefined;
	prNumber: number | undefined;
	headRefOid?: string | undefined;
	itemKeys?: string[] | undefined;
	createdAt: string;
	details?: Record<string, unknown> | undefined;
}

export interface DispatchPromptInput {
	data: PrFeedbackDownloadData;
	items: readonly FeedbackItemKey[];
}
