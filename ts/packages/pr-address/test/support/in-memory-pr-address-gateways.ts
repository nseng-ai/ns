import type {
	BranchHeadOidResult,
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	GatewayResult,
	PRDiscussionComment,
	PRLookupMiss,
	PRLookupResult,
	PRReview,
	PRReviewComment,
	PRReviewThread,
	PRReviewThreadState,
	PRSummary,
	PrAddressGitGateway,
	PrAddressGitHubGateway,
	Reaction,
	RepoContextResult,
	RestructuredFile,
} from "../../src/gateways.ts";

export interface InMemoryGitHubState {
	prs?: readonly PRSummary[] | undefined;
	prsByBranch?: ReadonlyMap<string, PRSummary> | Record<string, PRSummary> | undefined;
	reviews?: ReadonlyMap<number, readonly PRReview[]> | Record<number, readonly PRReview[]> | undefined;
	reviewThreads?: ReadonlyMap<number, readonly PRReviewThread[]> | Record<number, readonly PRReviewThread[]> | undefined;
	discussionComments?: ReadonlyMap<number, readonly PRDiscussionComment[]> | Record<number, readonly PRDiscussionComment[]> | undefined;
	listOpenPrsFailure?: GatewayFailure | undefined;
	lookupFailureBranches?: ReadonlySet<string> | undefined;
	lookupFailurePrNumbers?: ReadonlySet<number> | undefined;
	missingPrNumbers?: ReadonlySet<number> | undefined;
	threadReplyFailureIds?: ReadonlySet<string> | undefined;
	resolveFailureIds?: ReadonlySet<string> | undefined;
	unresolveFailureIds?: ReadonlySet<string> | undefined;
	reactionFailureCommentIds?: ReadonlySet<number> | undefined;
}

export interface InMemoryGitState {
	currentBranch?: string | null | undefined;
	currentBranchFailure?: GatewayFailure | undefined;
	insideWorkTree?: boolean | undefined;
	repoContextFailure?: GatewayFailure | undefined;
	branchHeadOids?: ReadonlyMap<string, string> | Record<string, string> | undefined;
	restructuredFiles?: readonly RestructuredFile[] | undefined;
	restructuredFilesFailure?: GatewayFailure | undefined;
}

export class InMemoryPrAddressGitHubGateway implements PrAddressGitHubGateway {
	private readonly prsByNumber: ReadonlyMap<number, PRSummary>;
	private readonly prsByBranch: ReadonlyMap<string, PRSummary>;
	private readonly reviews: ReadonlyMap<number, readonly PRReview[]>;
	private readonly reviewThreads: ReadonlyMap<number, readonly PRReviewThread[]>;
	private readonly discussionComments: ReadonlyMap<number, readonly PRDiscussionComment[]>;
	private readonly listOpenPrsFailure: GatewayFailure | undefined;
	private readonly lookupFailureBranches: ReadonlySet<string>;
	private readonly lookupFailurePrNumbers: ReadonlySet<number>;
	private readonly missingPrNumbers: ReadonlySet<number>;
	private readonly threadReplyFailureIds: ReadonlySet<string>;
	private readonly resolveFailureIds: ReadonlySet<string>;
	private readonly unresolveFailureIds: ReadonlySet<string>;
	private readonly reactionFailureCommentIds: ReadonlySet<number>;
	private readonly commentCalls: Array<{ prNumber: number; body: string }> = [];
	private readonly threadReplyCalls: Array<{ threadId: string; body: string }> = [];
	private readonly reactionCalls: Array<{ commentId: number; reaction: string }> = [];
	private readonly resolvedIds: string[] = [];
	private readonly unresolvedIds: string[] = [];
	private nextDiscussionCommentId = 1;
	private nextReviewCommentId = 1;
	private nextReactionId = 1;

	constructor(state: InMemoryGitHubState = {}) {
		const byBranch = new Map(stringMap(state.prsByBranch));
		const byNumber = new Map<number, PRSummary>();
		for (const pr of state.prs ?? []) {
			byNumber.set(pr.number, pr);
			byBranch.set(pr.head_ref_name, pr);
		}
		for (const pr of byBranch.values()) byNumber.set(pr.number, pr);
		this.prsByNumber = byNumber;
		this.prsByBranch = byBranch;
		this.reviews = numberMap(state.reviews);
		this.reviewThreads = numberMap(state.reviewThreads);
		this.discussionComments = numberMap(state.discussionComments);
		this.listOpenPrsFailure = state.listOpenPrsFailure;
		this.lookupFailureBranches = state.lookupFailureBranches ?? new Set();
		this.lookupFailurePrNumbers = state.lookupFailurePrNumbers ?? new Set();
		this.missingPrNumbers = state.missingPrNumbers ?? new Set();
		this.threadReplyFailureIds = state.threadReplyFailureIds ?? new Set();
		this.resolveFailureIds = state.resolveFailureIds ?? new Set();
		this.unresolveFailureIds = state.unresolveFailureIds ?? new Set();
		this.reactionFailureCommentIds = state.reactionFailureCommentIds ?? new Set();
	}

	get comments(): readonly { prNumber: number; body: string }[] {
		return clone(this.commentCalls);
	}

	get threadReplies(): readonly { threadId: string; body: string }[] {
		return clone(this.threadReplyCalls);
	}

	get reactions(): readonly { commentId: number; reaction: string }[] {
		return clone(this.reactionCalls);
	}

	get resolvedThreadIds(): readonly string[] {
		return [...this.resolvedIds];
	}

	get unresolvedThreadIds(): readonly string[] {
		return [...this.unresolvedIds];
	}

	async getPr(prNumber: number, _options: GatewayOptions): Promise<PRLookupResult> {
		if (this.lookupFailurePrNumbers.has(prNumber)) return { type: "failure", failure: { stderr: "gh auth failed", stdout: "", returncode: 4 } };
		if (this.missingPrNumbers.has(prNumber)) return prLookupMiss(prNumber);
		const pr = this.prsByNumber.get(prNumber);
		if (pr === undefined) return prLookupMiss(prNumber);
		return { type: "found", pr: clone(pr) };
	}

	async getPrForBranch(branch: string, _options: GatewayOptions): Promise<PRLookupResult> {
		if (this.lookupFailureBranches.has(branch)) return { type: "failure", failure: { stderr: "gh auth failed", stdout: "", returncode: 4 } };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return lookupMiss();
		return { type: "found", pr: clone(pr) };
	}

	async listOpenPrs(_options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>> {
		if (this.listOpenPrsFailure !== undefined) return { type: "failure", failure: clone(this.listOpenPrsFailure) };
		return { type: "ok", value: clone([...this.prsByNumber.values()].filter((pr) => pr.state === "OPEN")) };
	}

	async getReviews(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		return { type: "ok", value: clone(this.reviews.get(prNumber) ?? []) };
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const threads = clone(this.reviewThreads.get(prNumber) ?? []);
		return { type: "ok", value: options.shouldIncludeResolved ? threads : threads.filter((thread) => !thread.is_resolved) };
	}

	async getDiscussionComments(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		return { type: "ok", value: clone(this.discussionComments.get(prNumber) ?? []) };
	}

	async addPrDiscussionComment(prNumber: number, body: string, _options: GatewayOptions): Promise<GatewayResult<PRDiscussionComment>> {
		this.commentCalls.push({ prNumber, body });
		const id = this.nextDiscussionCommentId;
		this.nextDiscussionCommentId += 1;
		return { type: "ok", value: { id, body, author: "github-actions[bot]", url: `https://example.com/comment/${id}` } };
	}

	async addPrDiscussionCommentReaction(commentId: number, reaction: string, _options: GatewayOptions): Promise<GatewayResult<Reaction>> {
		if (this.reactionFailureCommentIds.has(commentId)) return { type: "failure", failure: { stderr: "reaction failed", stdout: "", returncode: 1 } };
		this.reactionCalls.push({ commentId, reaction });
		const id = this.nextReactionId;
		this.nextReactionId += 1;
		return { type: "ok", value: { id, comment_id: commentId, content: reaction } };
	}

	async addReviewThreadReply(threadId: string, body: string, _options: GatewayOptions): Promise<GatewayResult<PRReviewComment>> {
		if (this.threadReplyFailureIds.has(threadId)) return { type: "failure", failure: { stderr: "GitHub rejected the thread reply", stdout: "", returncode: 1 } };
		this.threadReplyCalls.push({ threadId, body });
		const id = this.nextReviewCommentId;
		this.nextReviewCommentId += 1;
		return { type: "ok", value: reviewComment({ id, body, author: "github-actions[bot]" }) };
	}

	async resolveReviewThread(threadId: string, _options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>> {
		if (this.resolveFailureIds.has(threadId)) return { type: "failure", failure: { stderr: "GitHub rejected the thread resolve", stdout: "", returncode: 1 } };
		this.resolvedIds.push(threadId);
		return { type: "ok", value: { thread_id: threadId, is_resolved: true } };
	}

	async unresolveReviewThread(threadId: string, _options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>> {
		if (this.unresolveFailureIds.has(threadId)) return { type: "failure", failure: { stderr: "GitHub rejected the thread unresolve", stdout: "", returncode: 1 } };
		this.unresolvedIds.push(threadId);
		return { type: "ok", value: { thread_id: threadId, is_resolved: false } };
	}
}

export class InMemoryPrAddressGitGateway implements PrAddressGitGateway {
	private readonly currentBranch: string | null;
	private readonly currentBranchFailure: GatewayFailure | undefined;
	private readonly insideWorkTree: boolean;
	private readonly repoContextFailure: GatewayFailure | undefined;
	private readonly branchHeadOids: ReadonlyMap<string, string>;
	private readonly restructuredFiles: readonly RestructuredFile[];
	private readonly restructuredFilesFailure: GatewayFailure | undefined;

	constructor(state: InMemoryGitState = {}) {
		this.currentBranch = state.currentBranch === undefined ? "main" : state.currentBranch;
		this.currentBranchFailure = state.currentBranchFailure;
		this.insideWorkTree = state.insideWorkTree ?? true;
		this.repoContextFailure = state.repoContextFailure;
		this.branchHeadOids = stringMap(state.branchHeadOids);
		this.restructuredFiles = clone(state.restructuredFiles ?? []);
		this.restructuredFilesFailure = state.restructuredFilesFailure;
	}

	async getCurrentBranch(_options: GatewayOptions): Promise<CurrentBranchResult> {
		if (this.currentBranchFailure !== undefined) return { type: "failure", failure: clone(this.currentBranchFailure) };
		if (this.currentBranch === null) return { type: "detached" };
		return { type: "branch", branch: this.currentBranch };
	}

	async isInsideWorkTree(_options: GatewayOptions): Promise<RepoContextResult> {
		if (this.repoContextFailure !== undefined) return { type: "failure", failure: clone(this.repoContextFailure) };
		return this.insideWorkTree ? { type: "inside" } : { type: "outside" };
	}

	async getBranchHeadOid(branch: string, _options: GatewayOptions): Promise<BranchHeadOidResult> {
		const oid = this.branchHeadOids.get(branch);
		if (oid === undefined) return { type: "missing", stderr: `unknown revision or path not in the working tree: ${branch}`, returncode: 128 };
		return { type: "found", oid };
	}

	async getRestructuredFiles(_baseRefName: string, _options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>> {
		if (this.restructuredFilesFailure !== undefined) return { type: "failure", failure: clone(this.restructuredFilesFailure) };
		return { type: "ok", value: clone(this.restructuredFiles) };
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

export function prSummary(overrides: Partial<PRSummary> = {}): PRSummary {
	return { number: 42, title: "Add feature", url: "https://github.example/pr/42", head_ref_name: "feature", base_ref_name: "main", state: "OPEN", ...overrides };
}

type PRReviewCommentForFactory = PRReviewThread["comments"][number];

function lookupMiss(): PRLookupMiss {
	return { type: "miss", stderr: "no PR found", returncode: 1 };
}

/** Mirrors the Python FakePRGateway miss text for number-keyed PR lookups. */
function prLookupMiss(prNumber: number): PRLookupMiss {
	return { type: "miss", stderr: `no PR found for PR ${prNumber}`, returncode: 1 };
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
