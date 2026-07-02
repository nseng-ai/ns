import type { GithubPrIdentity } from "@sdl/capability-kit/github/identity";

import type { PrFeedbackDownloadData } from "../feedback-download.ts";

export type FeedbackItemKind = "download" | "review" | "thread_comment" | "discussion_comment";
export type FeedbackFingerprintItemKind = "discussion_comment" | "review" | "review_comment";
export type WatchMode = "rest_fingerprint" | "heavy_fallback" | "stopped";
export type IgnoredFeedbackReason = "current_user" | "status_bot";

export interface FeedbackItemKey {
	kind: FeedbackItemKind;
	key: string;
	author?: string;
	path?: string;
	line?: number;
	jsonPointer?: string;
	itemPointer?: string;
}

export interface IgnoredFeedbackItem {
	item: FeedbackItemKey;
	reason: IgnoredFeedbackReason;
}

export interface PrFeedbackWatchGithubPrIdentity extends GithubPrIdentity {
	url?: string;
}

export interface FeedbackFingerprintItem {
	kind: FeedbackFingerprintItemKind;
	id: string;
	updatedAt?: string;
	author?: string;
	path?: string;
	line?: number;
	state?: string;
	commitId?: string;
	reviewId?: string;
	inReplyToId?: string;
}

export interface FeedbackFingerprint {
	key: string;
	items: FeedbackFingerprintItem[];
	latestTimestamp?: string;
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
	headRefOid?: string;
}

export interface WatchStatus {
	isEnabled: boolean;
	state: "stopped" | "active" | "polling" | "paused" | "dispatching" | "error";
	mode: WatchMode;
	prNumber?: number;
	branch?: string;
	intervalMs: number;
	seenCount: number;
	attemptedCount: number;
	queuedCount: number;
	lastPollAt?: string;
	lastRestPollAt?: string;
	lastHeavyCheckAt?: string;
	checkSummary?: PrCheckSummary;
	restFailures: number;
	lastError?: string;
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
	branch?: string;
	prNumber?: number;
	headRefOid?: string;
	itemKeys?: readonly string[];
	createdAt: string;
	details?: Record<string, unknown>;
}

export interface DispatchPromptInput {
	data: PrFeedbackDownloadData;
	items: readonly FeedbackItemKey[];
}
