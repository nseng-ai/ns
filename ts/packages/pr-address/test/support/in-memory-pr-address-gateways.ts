import type {
	GatewayOptions,
	GatewayResult,
	PRDiscussionComment,
	PRLookupMiss,
	PRLookupResult,
	PRReview,
	PRReviewThread,
	PRSummary,
	PrAddressGitHubGateway,
} from "../../src/gateways.ts";

export interface InMemoryGitHubState {
	prsByBranch?: ReadonlyMap<string, PRSummary> | Record<string, PRSummary> | undefined;
	reviews?: ReadonlyMap<number, readonly PRReview[]> | Record<number, readonly PRReview[]> | undefined;
	reviewThreads?: ReadonlyMap<number, readonly PRReviewThread[]> | Record<number, readonly PRReviewThread[]> | undefined;
	discussionComments?: ReadonlyMap<number, readonly PRDiscussionComment[]> | Record<number, readonly PRDiscussionComment[]> | undefined;
	lookupFailureBranches?: ReadonlySet<string> | undefined;
}

export class InMemoryPrAddressGitHubGateway implements PrAddressGitHubGateway {
	private readonly prsByBranch: ReadonlyMap<string, PRSummary>;
	private readonly reviews: ReadonlyMap<number, readonly PRReview[]>;
	private readonly reviewThreads: ReadonlyMap<number, readonly PRReviewThread[]>;
	private readonly discussionComments: ReadonlyMap<number, readonly PRDiscussionComment[]>;
	private readonly lookupFailureBranches: ReadonlySet<string>;

	constructor(state: InMemoryGitHubState = {}) {
		this.prsByBranch = stringMap(state.prsByBranch);
		this.reviews = numberMap(state.reviews);
		this.reviewThreads = numberMap(state.reviewThreads);
		this.discussionComments = numberMap(state.discussionComments);
		this.lookupFailureBranches = state.lookupFailureBranches ?? new Set();
	}

	async getPrForBranch(branch: string, _options: GatewayOptions): Promise<PRLookupResult> {
		if (this.lookupFailureBranches.has(branch)) return { type: "failure", failure: { stderr: "gh auth failed", stdout: "", returncode: 4 } };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return lookupMiss();
		return { type: "found", pr: clone(pr) };
	}

	async getReviews(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		return { type: "ok", value: clone(this.reviews.get(prNumber) ?? []) };
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { includeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const threads = clone(this.reviewThreads.get(prNumber) ?? []);
		return { type: "ok", value: options.includeResolved ? threads : threads.filter((thread) => !thread.is_resolved) };
	}

	async getDiscussionComments(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		return { type: "ok", value: clone(this.discussionComments.get(prNumber) ?? []) };
	}
}

export function review(overrides: Partial<PRReview> = {}): PRReview {
	return { id: "PRR_1", author: "reviewer", body: "Please fix", state: "CHANGES_REQUESTED", submitted_at: "2025-01-01T00:00:00Z", ...overrides };
}

export function reviewComment(overrides: Partial<PRReviewCommentForFactory> = {}): PRReviewCommentForFactory {
	return { id: 1, body: "Please add tests", author: "reviewer", path: "file.ts", line: 10, start_line: null, created_at: "2025-01-01T00:00:00Z", ...overrides };
}

export function reviewThread(overrides: Partial<PRReviewThread> = {}): PRReviewThread {
	return { id: "PRRT_1", path: "file.ts", line: 10, start_line: null, is_resolved: false, is_outdated: false, comments: [reviewComment()], ...overrides };
}

export function discussionComment(overrides: Partial<PRDiscussionComment> = {}): PRDiscussionComment {
	return { id: 11, body: "Top-level comment", author: "reviewer", url: "https://example.com/comment/11", ...overrides };
}

type PRReviewCommentForFactory = PRReviewThread["comments"][number];

function lookupMiss(): PRLookupMiss {
	return { type: "miss", stderr: "no PR found", returncode: 1 };
}

function stringMap<T>(value: ReadonlyMap<string, T> | Record<string, T> | undefined): ReadonlyMap<string, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return value;
	return new Map(Object.entries(value));
}

function numberMap<T>(value: ReadonlyMap<number, T> | Record<number, T> | undefined): ReadonlyMap<number, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return value;
	return new Map(Object.entries(value).map(([key, item]) => [Number(key), item]));
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
