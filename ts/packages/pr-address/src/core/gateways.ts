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

export type GatewayResult<T> = CoreGatewayResult<T>;
export type PRLookupResult =
	| { type: "found"; pr: PRSummary }
	| PRLookupMiss
	| { type: "failure"; failure: GatewayFailure };
export type CurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; failure: GatewayFailure };
export type RepoContextResult =
	| { type: "inside" }
	| { type: "outside" }
	| { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface PrAddressGitHubGateway {
	getPr(prNumber: number, options: GatewayOptions): Promise<PRLookupResult>;
	getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult>;
	listOpenPrs(options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>>;
	getReviews(
		prNumber: number,
		options: GatewayOptions,
	): Promise<GatewayResult<readonly PRReview[]>>;
	getReviewThreads(
		prNumber: number,
		options: GatewayOptions & { shouldIncludeResolved: boolean },
	): Promise<GatewayResult<readonly PRReviewThread[]>>;
	getDiscussionComments(
		prNumber: number,
		options: GatewayOptions,
	): Promise<GatewayResult<readonly PRDiscussionComment[]>>;
}

export interface PrAddressGitGateway {
	getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult>;
	isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult>;
}
