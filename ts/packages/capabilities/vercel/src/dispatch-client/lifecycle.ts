export type DispatchSourcePublicationMutationState = "none" | "observed" | "possible";

export interface DispatchSourcePublicationMutationEvidence {
	readonly local: DispatchSourcePublicationMutationState;
	readonly remote: DispatchSourcePublicationMutationState;
}

export type DispatchCompletedSourceLifecycle =
	| { readonly type: "already-current" }
	| {
			readonly type: "git-pushed";
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly type: "graphite-submitted";
			readonly mutation: DispatchSourcePublicationMutationEvidence;
			readonly affectedBranches: readonly string[];
	  };

export interface DispatchGraphitePublicationAttemptedLifecycle {
	readonly type: "graphite-publication-attempted";
	readonly mutation: DispatchSourcePublicationMutationEvidence;
	readonly affectedBranches: readonly string[];
}

export type DispatchSourceLifecycle =
	| DispatchCompletedSourceLifecycle
	| {
			readonly type: "git-push-attempted";
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly type: "graphite-planning";
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| DispatchGraphitePublicationAttemptedLifecycle;

export interface DispatchLifecycleAnchorPr {
	readonly branch: string;
	readonly number: number;
	readonly url: string;
}

export type DispatchLifecycleReceipt =
	| { readonly stage: "source"; readonly source: DispatchSourceLifecycle }
	| {
			readonly stage: "anchor-pushed";
			readonly source: DispatchCompletedSourceLifecycle;
			readonly anchorBranch: string;
	  }
	| {
			readonly stage: "pr-opened";
			readonly source: DispatchCompletedSourceLifecycle;
			readonly anchorPr: DispatchLifecycleAnchorPr;
	  }
	| {
			readonly stage: "run-started";
			readonly source: DispatchCompletedSourceLifecycle;
			readonly anchorPr: DispatchLifecycleAnchorPr;
			readonly runId: string;
	  };

export interface DispatchGraphitePublicationAttemptedReceipt {
	readonly stage: "source";
	readonly source: DispatchGraphitePublicationAttemptedLifecycle;
}

export type DispatchSourceRevalidationReason =
	| "source-read-failed"
	| "repository-drift"
	| "branch-drift"
	| "head-drift"
	| "dirty-read-failed"
	| "dirty-tree"
	| "preflight-failed"
	| "remote-tip-read-failed"
	| "remote-tip-mismatch";
