import type { ErrorInfo, GatewayResult as CoreGatewayResult } from "@asdl/core/submit";

export type GatewayFailure = ErrorInfo & {
	stderr?: string | undefined;
	stdout?: string | undefined;
	returncode?: number | undefined;
};

export interface PRLookupMiss {
	type: "miss";
	stderr: string;
	returncode: number;
}

export interface PRSummary {
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: string;
	head_ref_oid?: string | null | undefined;
}

export interface PRReview {
	id: string;
	author: string;
	body: string;
	state: string;
	submitted_at: string;
}

export interface PRReviewComment {
	id: number;
	body: string;
	author: string;
	path: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
}

export interface PRReviewThread {
	id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_resolved: boolean;
	is_outdated: boolean;
	comments: readonly PRReviewComment[];
}

export interface PRDiscussionComment {
	id: number;
	body: string;
	author: string;
	url: string;
}

export interface Reaction {
	id: number;
	comment_id: number;
	content: string;
}

export interface PRReviewThreadState {
	thread_id: string;
	is_resolved: boolean;
}

export interface RestructuredFile {
	status: string;
	old_path: string | null;
	new_path: string;
	similarity: number | null;
}

export type GatewayResult<T> = CoreGatewayResult<T>;
export type PRLookupResult = { type: "found"; pr: PRSummary } | PRLookupMiss | { type: "failure"; failure: GatewayFailure };
export type CurrentBranchResult = { type: "branch"; branch: string } | { type: "detached" } | { type: "failure"; failure: GatewayFailure };
export type BranchHeadOidResult = { type: "found"; oid: string } | { type: "missing"; stderr: string; returncode: number } | { type: "failure"; failure: GatewayFailure };
export type CommitChangedFilesResult = { type: "ok"; files: readonly string[] } | { type: "failure"; failure: GatewayFailure };
export type RepoContextResult = { type: "inside" } | { type: "outside" } | { type: "failure"; failure: GatewayFailure };
export type WorkTreeRootResult = { type: "inside"; root: string } | { type: "outside" } | { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface PrAddressGitHubGateway {
	getPr(prNumber: number, options: GatewayOptions): Promise<PRLookupResult>;
	getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult>;
	listOpenPrs(options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>>;
	getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>>;
	getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>>;
	getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>>;
	addPrDiscussionComment(prNumber: number, body: string, options: GatewayOptions): Promise<GatewayResult<PRDiscussionComment>>;
	addPrDiscussionCommentReaction(commentId: number, reaction: string, options: GatewayOptions): Promise<GatewayResult<Reaction>>;
	addReviewThreadReply(threadId: string, body: string, options: GatewayOptions): Promise<GatewayResult<PRReviewComment>>;
	resolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>>;
	unresolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>>;
}

export interface PrAddressGitGateway {
	getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult>;
	isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult>;
	getWorkTreeRoot(options: GatewayOptions): Promise<WorkTreeRootResult>;
	getBranchHeadOid(branch: string, options: GatewayOptions): Promise<BranchHeadOidResult>;
	getCommitChangedFiles(commitSha: string, options: GatewayOptions): Promise<CommitChangedFilesResult>;
	getRestructuredFiles(baseRefName: string, options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>>;
}
