import type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	GatewayResult,
	PRDiscussionComment,
	PRLookupMiss,
	PRLookupResult,
	PRReview,
	PRReviewThread,
	PRSummary,
	PrAddressGitGateway,
	PrAddressGitHubGateway,
	RepoContextResult,
} from "../../src/core/gateways.ts";
import type { PrAddressContext } from "../../src/context.ts";

export function fakePrAddressContext(overrides: Partial<PrAddressContext> = {}): PrAddressContext {
	return {
		github: new InMemoryPrAddressGitHubGateway(),
		git: new InMemoryPrAddressGitGateway(),
		...overrides,
	};
}

const FAKE_GH_AUTH_FAILED_STDERR = "gh auth failed";
const FAKE_PR_LOOKUP_MISS_STDERR = "no PR found";

function fakePrLookupMissStderr(prNumber: number): string {
	return `no PR found for PR ${prNumber}`;
}

function fakeGatewayFailure(stderr: string, returncode: number): GatewayFailure {
	return { code: "fake_gateway_failure", message: stderr, stdout: "", stderr, returncode, details: { stdout: "", stderr, returncode } };
}

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
	reviewsFailurePrNumbers?: ReadonlySet<number> | undefined;
	reviewThreadsFailurePrNumbers?: ReadonlySet<number> | undefined;
	discussionCommentsFailurePrNumbers?: ReadonlySet<number> | undefined;
}

export interface InMemoryGitState {
	currentBranch?: string | null | undefined;
	currentBranchFailure?: GatewayFailure | undefined;
	isInsideWorkTree?: boolean | undefined;
	repoContextFailure?: GatewayFailure | undefined;
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
	private readonly reviewsFailurePrNumbers: ReadonlySet<number>;
	private readonly reviewThreadsFailurePrNumbers: ReadonlySet<number>;
	private readonly discussionCommentsFailurePrNumbers: ReadonlySet<number>;

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
		this.reviewsFailurePrNumbers = state.reviewsFailurePrNumbers ?? new Set();
		this.reviewThreadsFailurePrNumbers = state.reviewThreadsFailurePrNumbers ?? new Set();
		this.discussionCommentsFailurePrNumbers = state.discussionCommentsFailurePrNumbers ?? new Set();
	}

	async getPr(prNumber: number, _options: GatewayOptions): Promise<PRLookupResult> {
		if (this.lookupFailurePrNumbers.has(prNumber)) return { type: "failure", failure: fakeGatewayFailure(FAKE_GH_AUTH_FAILED_STDERR, 4) };
		if (this.missingPrNumbers.has(prNumber)) return prLookupMiss(prNumber);
		const pr = this.prsByNumber.get(prNumber);
		if (pr === undefined) return prLookupMiss(prNumber);
		return { type: "found", pr: clone(pr) };
	}

	async getPrForBranch(branch: string, _options: GatewayOptions): Promise<PRLookupResult> {
		if (this.lookupFailureBranches.has(branch)) return { type: "failure", failure: fakeGatewayFailure(FAKE_GH_AUTH_FAILED_STDERR, 4) };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return lookupMiss();
		return { type: "found", pr: clone(pr) };
	}

	async listOpenPrs(_options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>> {
		if (this.listOpenPrsFailure !== undefined) return { ok: false, error: clone(this.listOpenPrsFailure) };
		return { ok: true, value: clone([...this.prsByNumber.values()].filter((pr) => pr.state === "OPEN")) };
	}

	async getReviews(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		if (this.reviewsFailurePrNumbers.has(prNumber)) return { ok: false, error: fakeGatewayFailure(FAKE_GH_AUTH_FAILED_STDERR, 4) };
		return { ok: true, value: clone(this.reviews.get(prNumber) ?? []) };
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		if (this.reviewThreadsFailurePrNumbers.has(prNumber)) return { ok: false, error: fakeGatewayFailure(FAKE_GH_AUTH_FAILED_STDERR, 4) };
		const threads = clone(this.reviewThreads.get(prNumber) ?? []);
		return { ok: true, value: options.shouldIncludeResolved ? threads : threads.filter((thread) => !thread.is_resolved) };
	}

	async getDiscussionComments(prNumber: number, _options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		if (this.discussionCommentsFailurePrNumbers.has(prNumber)) return { ok: false, error: fakeGatewayFailure(FAKE_GH_AUTH_FAILED_STDERR, 4) };
		return { ok: true, value: clone(this.discussionComments.get(prNumber) ?? []) };
	}
}

export class InMemoryPrAddressGitGateway implements PrAddressGitGateway {
	private readonly currentBranch: string | null;
	private readonly currentBranchFailure: GatewayFailure | undefined;
	private readonly isConfiguredInsideWorkTree: boolean;
	private readonly repoContextFailure: GatewayFailure | undefined;

	constructor(state: InMemoryGitState = {}) {
		this.currentBranch = state.currentBranch === undefined ? "main" : state.currentBranch;
		this.currentBranchFailure = state.currentBranchFailure;
		this.isConfiguredInsideWorkTree = state.isInsideWorkTree ?? true;
		this.repoContextFailure = state.repoContextFailure;
	}

	async getCurrentBranch(_options: GatewayOptions): Promise<CurrentBranchResult> {
		if (this.currentBranchFailure !== undefined) return { type: "failure", failure: this.currentBranchFailure };
		if (this.currentBranch === null) return { type: "detached" };
		return { type: "branch", branch: this.currentBranch };
	}

	async isInsideWorkTree(_options: GatewayOptions): Promise<RepoContextResult> {
		if (this.repoContextFailure !== undefined) return { type: "failure", failure: this.repoContextFailure };
		return this.isConfiguredInsideWorkTree ? { type: "inside" } : { type: "outside" };
	}
}

function lookupMiss(): PRLookupMiss {
	return { type: "miss", stderr: FAKE_PR_LOOKUP_MISS_STDERR, returncode: 1 };
}

function prLookupMiss(prNumber: number): PRLookupMiss {
	return { type: "miss", stderr: fakePrLookupMissStderr(prNumber), returncode: 1 };
}

function numberMap<T>(value: ReadonlyMap<number, T> | Record<number, T> | undefined): ReadonlyMap<number, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value).map(([key, item]) => [Number(key), item]));
}

function stringMap<T>(value: ReadonlyMap<string, T> | Record<string, T> | undefined): ReadonlyMap<string, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value));
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

export function prSummary(overrides: Partial<PRSummary> = {}): PRSummary {
	return {
		number: 123,
		title: "PR title",
		url: "https://github.com/acme/repo/pull/123",
		head_ref_name: "feature/pr",
		base_ref_name: "main",
		state: "OPEN",
		...overrides,
	};
}

export function review(overrides: Partial<PRReview> = {}): PRReview {
	return {
		id: "PRR_1",
		author: "reviewer",
		body: "Review body",
		state: "CHANGES_REQUESTED",
		submitted_at: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function reviewComment(overrides: Partial<PRReviewThread["comments"][number]> = {}): PRReviewThread["comments"][number] {
	return {
		id: 10,
		body: "Thread comment",
		author: "reviewer",
		path: "src/file.ts",
		line: 7,
		start_line: null,
		created_at: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function reviewThread(overrides: Partial<PRReviewThread> = {}): PRReviewThread {
	return {
		id: "PRRT_1",
		path: "src/file.ts",
		line: 7,
		start_line: null,
		is_resolved: false,
		is_outdated: false,
		comments: [reviewComment()],
		...overrides,
	};
}

export function discussionComment(overrides: Partial<PRDiscussionComment> = {}): PRDiscussionComment {
	return {
		id: 90,
		body: "Discussion comment",
		author: "reviewer",
		url: "https://github.com/acme/repo/pull/123#issuecomment-90",
		...overrides,
	};
}
