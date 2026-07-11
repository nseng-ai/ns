import type {
	GithubBranchPrChecksOutcome,
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	PrAddressGithubGateway,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupMiss,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
	GithubStatusChecks,
} from "@nseng-ai/pr-feedback/api";
import type { Result } from "@nseng-ai/foundation/result";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import type { PrAddressContext } from "../../src/context.ts";

export function fakePrAddressContext(overrides: Partial<PrAddressContext> = {}): PrAddressContext {
	return {
		git: new InMemoryGitGateway({ currentBranch: "main" }),
		prFeedback: new InMemoryGithubPrFeedbackGateway(),
		...overrides,
	};
}

const FAKE_GH_AUTH_FAILED_STDERR = "gh auth failed";
const FAKE_PR_LOOKUP_MISS_STDERR = "no PR found";

function fakePrLookupMissStderr(prNumber: number): string {
	return `no PR found for PR ${prNumber}`;
}

export function fakePrFeedbackFailure(
	message: string,
	operation: GithubPrFeedbackOperation = "getPr",
): GithubPrFeedbackFailure {
	return {
		code: "github_pr_feedback_gh_failed",
		message,
		details: { operation, stdout: "", stderr: message, exitCode: 4 },
	};
}

export interface InMemoryPrFeedbackState {
	prs?: readonly GithubPrSummary[];
	prsByBranch?: ReadonlyMap<string, GithubPrSummary> | Record<string, GithubPrSummary>;
	reviews?:
		| ReadonlyMap<number, readonly GithubPrReview[]>
		| Record<number, readonly GithubPrReview[]>;
	reviewThreads?:
		| ReadonlyMap<number, readonly GithubPrReviewThread[]>
		| Record<number, readonly GithubPrReviewThread[]>;
	discussionComments?:
		| ReadonlyMap<number, readonly GithubPrDiscussionComment[]>
		| Record<number, readonly GithubPrDiscussionComment[]>;
	checks?: ReadonlyMap<number, GithubStatusChecks> | Record<number, GithubStatusChecks>;
	checksFailurePrNumbers?: ReadonlySet<number>;
	ambiguousBranchPrs?:
		| ReadonlyMap<string, readonly GithubPrSummary[]>
		| Record<string, readonly GithubPrSummary[]>;
	branchPrChecksFailure?: GithubPrFeedbackFailure;
	listOpenPrsFailure?: GithubPrFeedbackFailure;
	lookupFailureBranches?: ReadonlySet<string>;
	lookupFailurePrNumbers?: ReadonlySet<number>;
	missingPrNumbers?: ReadonlySet<number>;
	reviewFailurePrNumbers?: ReadonlySet<number>;
	reviewThreadsFailurePrNumbers?: ReadonlySet<number>;
	discussionCommentsFailurePrNumbers?: ReadonlySet<number>;
	replyFailures?:
		| ReadonlyMap<string, GithubPrFeedbackFailure>
		| Record<string, GithubPrFeedbackFailure>;
	resolveFailureThreadIds?: ReadonlySet<string>;
	bulkResolveFailure?: GithubPrFeedbackFailure;
}

export interface ReviewThreadReplyLogEntry {
	threadId: string;
	body: string;
}

export interface ResolveReviewThreadLogEntry {
	threadId: string;
}

export interface ResolveReviewThreadsLogEntry {
	threadIds: readonly string[];
}

export class InMemoryGithubPrFeedbackGateway implements PrAddressGithubGateway {
	private readonly prsByNumber: ReadonlyMap<number, GithubPrSummary>;
	private readonly prsByBranch: ReadonlyMap<string, GithubPrSummary>;
	private readonly reviews: ReadonlyMap<number, readonly GithubPrReview[]>;
	private readonly reviewThreads: ReadonlyMap<number, readonly GithubPrReviewThread[]>;
	private readonly discussionComments: ReadonlyMap<number, readonly GithubPrDiscussionComment[]>;
	private readonly checks: ReadonlyMap<number, GithubStatusChecks>;
	private readonly checksFailurePrNumbers: ReadonlySet<number>;
	private readonly ambiguousBranchPrs: ReadonlyMap<string, readonly GithubPrSummary[]>;
	private readonly branchPrChecksFailure: GithubPrFeedbackFailure | undefined;
	private readonly listOpenPrsFailure: GithubPrFeedbackFailure | undefined;
	private readonly lookupFailureBranches: ReadonlySet<string>;
	private readonly lookupFailurePrNumbers: ReadonlySet<number>;
	private readonly missingPrNumbers: ReadonlySet<number>;
	private readonly reviewFailurePrNumbers: ReadonlySet<number>;
	private readonly reviewThreadsFailurePrNumbers: ReadonlySet<number>;
	private readonly discussionCommentsFailurePrNumbers: ReadonlySet<number>;
	private readonly replyFailures: ReadonlyMap<string, GithubPrFeedbackFailure>;
	private readonly resolveFailureThreadIds: ReadonlySet<string>;
	private readonly bulkResolveFailure: GithubPrFeedbackFailure | undefined;
	private readonly repliesInternal: ReviewThreadReplyLogEntry[] = [];
	private readonly resolutionsInternal: ResolveReviewThreadLogEntry[] = [];
	private readonly bulkResolutionsInternal: ResolveReviewThreadsLogEntry[] = [];

	constructor(state: InMemoryPrFeedbackState = {}) {
		const byBranch = new Map(stringMap(state.prsByBranch));
		const byNumber = new Map<number, GithubPrSummary>();
		for (const pr of state.prs ?? []) {
			byNumber.set(pr.number, pr);
			byBranch.set(pr.headRefName, pr);
		}
		// Explicit branch mappings and prs both seed lookup maps; backfill number lookup so either path sees the same fake PRs.
		for (const pr of byBranch.values()) byNumber.set(pr.number, pr);
		this.prsByNumber = byNumber;
		this.prsByBranch = byBranch;
		this.reviews = numberMap(state.reviews);
		this.reviewThreads = numberMap(state.reviewThreads);
		this.discussionComments = numberMap(state.discussionComments);
		this.checks = numberMap(state.checks);
		this.checksFailurePrNumbers = state.checksFailurePrNumbers ?? new Set();
		this.ambiguousBranchPrs = stringMap(state.ambiguousBranchPrs);
		this.branchPrChecksFailure = state.branchPrChecksFailure;
		this.listOpenPrsFailure = state.listOpenPrsFailure;
		this.lookupFailureBranches = state.lookupFailureBranches ?? new Set();
		this.lookupFailurePrNumbers = state.lookupFailurePrNumbers ?? new Set();
		this.missingPrNumbers = state.missingPrNumbers ?? new Set();
		this.reviewFailurePrNumbers = state.reviewFailurePrNumbers ?? new Set();
		this.reviewThreadsFailurePrNumbers = state.reviewThreadsFailurePrNumbers ?? new Set();
		this.discussionCommentsFailurePrNumbers = state.discussionCommentsFailurePrNumbers ?? new Set();
		this.replyFailures = stringMap(state.replyFailures);
		this.resolveFailureThreadIds = state.resolveFailureThreadIds ?? new Set();
		this.bulkResolveFailure = state.bulkResolveFailure;
	}

	get replies(): readonly ReviewThreadReplyLogEntry[] {
		return this.repliesInternal.map((entry) => ({ ...entry }));
	}

	get resolutions(): readonly ResolveReviewThreadLogEntry[] {
		return this.resolutionsInternal.map((entry) => ({ ...entry }));
	}

	get bulkResolutions(): readonly ResolveReviewThreadsLogEntry[] {
		return this.bulkResolutionsInternal.map((entry) => ({ threadIds: [...entry.threadIds] }));
	}

	async getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		if (this.lookupFailurePrNumbers.has(params.prNumber))
			return { ok: false, error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR) };
		if (this.missingPrNumbers.has(params.prNumber)) return prLookupMiss(params.prNumber);
		const pr = this.prsByNumber.get(params.prNumber);
		if (pr === undefined) return prLookupMiss(params.prNumber);
		return { ok: true, value: { found: true, pr: clone(pr) } };
	}

	async getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		if (this.lookupFailureBranches.has(params.branch))
			return {
				ok: false,
				error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR, "getPrForBranch"),
			};
		const pr = this.prsByBranch.get(params.branch);
		if (pr === undefined) return lookupMiss();
		return { ok: true, value: { found: true, pr: clone(pr) } };
	}

	async listOpenPrs(
		_params: GithubPrFeedbackOptions,
	): Promise<Result<readonly GithubPrSummary[], GithubPrFeedbackFailure>> {
		if (this.listOpenPrsFailure !== undefined)
			return { ok: false, error: clone(this.listOpenPrsFailure) };
		return {
			ok: true,
			value: clone([...this.prsByNumber.values()].filter((pr) => pr.state === "OPEN")),
		};
	}

	async getPrReviews(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReview[], GithubPrFeedbackFailure>> {
		if (this.reviewFailurePrNumbers.has(params.prNumber))
			return {
				ok: false,
				error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR, "getPrReviews"),
			};
		return { ok: true, value: clone(this.reviews.get(params.prNumber) ?? []) };
	}

	async getPrReviewThreads(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>> {
		if (this.reviewThreadsFailurePrNumbers.has(params.prNumber))
			return {
				ok: false,
				error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR, "getPrReviewThreads"),
			};
		return { ok: true, value: clone(this.reviewThreads.get(params.prNumber) ?? []) };
	}

	async getPrDiscussionComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrDiscussionComment[], GithubPrFeedbackFailure>> {
		if (this.discussionCommentsFailurePrNumbers.has(params.prNumber))
			return {
				ok: false,
				error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR, "getPrDiscussionComments"),
			};
		return { ok: true, value: clone(this.discussionComments.get(params.prNumber) ?? []) };
	}

	async getPrChecks(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubStatusChecks, GithubPrFeedbackFailure>> {
		if (this.checksFailurePrNumbers.has(params.prNumber))
			return {
				ok: false,
				error: fakePrFeedbackFailure(FAKE_GH_AUTH_FAILED_STDERR, "getPrChecks"),
			};
		return {
			ok: true,
			value: clone(
				this.checks.get(params.prNumber) ?? {
					counts: { passing: 0, pending: 0, failing: 0, cancelled: 0, unknown: 0, hasMore: false },
					checks: [],
				},
			),
		};
	}

	async getBranchPrChecks(
		params: GithubPrFeedbackOptions & { readonly branches: readonly string[] },
	): Promise<Result<readonly GithubBranchPrChecksOutcome[], GithubPrFeedbackFailure>> {
		if (this.branchPrChecksFailure !== undefined)
			return { ok: false, error: clone(this.branchPrChecksFailure) };
		const outcomes: GithubBranchPrChecksOutcome[] = [];
		for (const branch of params.branches) {
			const ambiguous = this.ambiguousBranchPrs.get(branch);
			if (ambiguous !== undefined) {
				outcomes.push({ branch, type: "ambiguous", candidates: clone([...ambiguous]) });
				continue;
			}
			const pr = this.prsByBranch.get(branch);
			if (pr === undefined || pr.state !== "OPEN") {
				outcomes.push({ branch, type: "missing" });
				continue;
			}
			outcomes.push({
				branch,
				type: "found",
				pr: clone(pr),
				checks: clone(
					this.checks.get(pr.number) ?? {
						counts: {
							passing: 0,
							pending: 0,
							failing: 0,
							cancelled: 0,
							unknown: 0,
							hasMore: false,
						},
						checks: [],
					},
				),
			});
		}
		return { ok: true, value: outcomes };
	}

	async replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>> {
		const replyFailure = this.replyFailures.get(params.threadId);
		if (replyFailure !== undefined) return { ok: false, error: clone(replyFailure) };
		this.repliesInternal.push({ threadId: params.threadId, body: params.body });
		return {
			ok: true,
			value: {
				threadId: params.threadId,
				comment: {
					id: this.repliesInternal.length,
					body: params.body,
					author: "agent",
					path: "",
					line: null,
					startLine: null,
					createdAt: "2026-06-01T00:00:00Z",
					url: `https://github.com/acme/repo/pull/1#discussion_r${this.repliesInternal.length}`,
				},
			},
		};
	}

	async resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>> {
		if (this.resolveFailureThreadIds.has(params.threadId))
			return { ok: false, error: fakePrFeedbackFailure("resolve failed", "resolveReviewThread") };
		this.resolutionsInternal.push({ threadId: params.threadId });
		return { ok: true, value: { threadId: params.threadId, isResolved: true } };
	}

	async resolveReviewThreads(
		params: GithubPrFeedbackOptions & { readonly threadIds: readonly string[] },
	): Promise<Result<readonly GithubReviewThreadState[], GithubPrFeedbackFailure>> {
		this.bulkResolutionsInternal.push({ threadIds: [...params.threadIds] });
		if (this.bulkResolveFailure !== undefined) {
			return { ok: false, error: clone(this.bulkResolveFailure) };
		}
		const states: GithubReviewThreadState[] = [];
		for (const threadId of params.threadIds) {
			if (this.resolveFailureThreadIds.has(threadId)) {
				return {
					ok: false,
					error: fakePrFeedbackFailure("resolve failed", "resolveReviewThreads"),
				};
			}
			states.push({ threadId, isResolved: true });
		}
		return { ok: true, value: states };
	}
}

function lookupMiss(): Result<GithubPrLookupOutcome, GithubPrFeedbackFailure> {
	return { ok: true, value: { found: false, miss: lookupMissValue() } };
}

function prLookupMiss(prNumber: number): Result<GithubPrLookupOutcome, GithubPrFeedbackFailure> {
	return {
		ok: true,
		value: { found: false, miss: { stderr: fakePrLookupMissStderr(prNumber), exitCode: 1 } },
	};
}

function lookupMissValue(): GithubPrLookupMiss {
	return { stderr: FAKE_PR_LOOKUP_MISS_STDERR, exitCode: 1 };
}

function numberMap<T>(
	value: ReadonlyMap<number, T> | Record<number, T> | undefined,
): ReadonlyMap<number, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value).map(([key, item]) => [Number(key), item]));
}

function stringMap<T>(
	value: ReadonlyMap<string, T> | Record<string, T> | undefined,
): ReadonlyMap<string, T> {
	if (value === undefined) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value));
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

export function prSummary(overrides: Partial<GithubPrSummary> = {}): GithubPrSummary {
	return {
		number: 123,
		title: "PR title",
		url: "https://github.com/acme/repo/pull/123",
		headRefName: "feature/pr",
		baseRefName: "main",
		state: "OPEN",
		...overrides,
	};
}

export function review(overrides: Partial<GithubPrReview> = {}): GithubPrReview {
	return {
		id: "PRR_1",
		author: "reviewer",
		body: "Review body",
		state: "CHANGES_REQUESTED",
		submittedAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function reviewComment(
	overrides: Partial<GithubPrReviewComment> = {},
): GithubPrReviewComment {
	return {
		id: 10,
		body: "Thread comment",
		author: "reviewer",
		path: "src/file.ts",
		line: 7,
		startLine: null,
		createdAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function reviewThread(overrides: Partial<GithubPrReviewThread> = {}): GithubPrReviewThread {
	return {
		id: "PRRT_1",
		path: "src/file.ts",
		line: 7,
		startLine: null,
		isResolved: false,
		isOutdated: false,
		comments: [reviewComment()],
		...overrides,
	};
}

export function discussionComment(
	overrides: Partial<GithubPrDiscussionComment> = {},
): GithubPrDiscussionComment {
	return {
		id: 90,
		body: "Discussion comment",
		author: "reviewer",
		url: "https://github.com/acme/repo/pull/123#issuecomment-90",
		...overrides,
	};
}
