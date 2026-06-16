export const PR_ADDRESS_TARGET_VERBS = ["feedback", "details", "plan", "batch", "status", "reply"] as const;
export type PrAddressTargetVerb = (typeof PR_ADDRESS_TARGET_VERBS)[number];

export const PR_ADDRESS_READ_ONLY_VERBS = ["feedback", "details", "status"] as const;
export type PrAddressReadOnlyVerb = (typeof PR_ADDRESS_READ_ONLY_VERBS)[number];

export type PrAddressResult<T, E extends PrAddressError = PrAddressError> = { type: "ok"; value: T } | { type: "error"; error: E };

export interface PrAddressError {
	type: "invalid_request" | "github_unavailable" | "not_found" | "stale_handle";
	message: string;
}

export type FeedbackDetailHandle =
	| { type: "review"; prNumber: number; reviewId: string }
	| { type: "thread_comment"; prNumber: number; threadId: string; commentId: number }
	| { type: "discussion_comment"; prNumber: number; commentId: number };

export interface FeedbackRequest {
	prNumber: number;
}

export interface DetailsRequest {
	handle: FeedbackDetailHandle;
}

export interface StatusRequest {
	prNumber: number;
}

export interface FeedbackItemSummary {
	handle: FeedbackDetailHandle;
	author: string;
	bodyExcerpt: string;
	location?: { path: string; line: number | null; startLine: number | null } | undefined;
}

export interface FeedbackResult {
	prNumber: number;
	items: readonly FeedbackItemSummary[];
}

export interface DetailsResult {
	handle: FeedbackDetailHandle;
	body: string;
}

export interface StatusResult {
	prNumber: number;
	unresolvedThreadIds: readonly string[];
}

export interface RunKernel {
	readonly fetchFeedback: (request: FeedbackRequest) => Promise<PrAddressResult<FeedbackResult>>;
	readonly fetchDetails: (request: DetailsRequest) => Promise<PrAddressResult<DetailsResult>>;
	readonly fetchStatus: (request: StatusRequest) => Promise<PrAddressResult<StatusResult>>;
}

export interface PrAddressRunEngine {
	readonly feedback: (request: FeedbackRequest) => Promise<PrAddressResult<FeedbackResult>>;
	readonly details: (request: DetailsRequest) => Promise<PrAddressResult<DetailsResult>>;
	readonly status: (request: StatusRequest) => Promise<PrAddressResult<StatusResult>>;
}

export interface PrAddressRunEngineFactory {
	readonly create: (kernel: RunKernel) => PrAddressRunEngine;
}
