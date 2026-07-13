// Gateway seams and result vocabulary for the `ns dispatch prompt` local
// CLI (steel-thread sub-slice 3). All external I/O the command performs —
// git facts and pushes, GitHub anchor-PR creation/stamping on the user's
// own credentials, the authenticated trigger-route call, and the local
// Development-OIDC token source — crosses these interfaces so the command
// core stays pure and fake-driven in tests. Consumer-gateway rule: methods
// name what dispatch needs, not the underlying tool mechanics. Live
// behavior against the deployed trigger route is pending verification.
import type { DispatchRunInput } from "../../dispatch/dispatch-run.ts";

export interface DispatchGatewayError {
	readonly code: string;
	readonly message: string;
}

/**
 * Git facts and pushes for the dispatch source: the current branch, its
 * exact head, dirty state (the clean-tree rule), remote freshness, the
 * push-first behavior, and the anchor-branch push. The real adapter runs
 * git on the user's machine with the user's own credentials.
 */
export interface DispatchWorkspaceGitGateway {
	/** Resolve the repo root, current branch, and exact head commit. */
	resolveSourceRef(options: { readonly cwd: string }): Promise<DispatchSourceRefResult>;
	/** List paths with uncommitted changes (the dirty-tree refusal list). */
	listDirtyPaths(options: {
		readonly cwd: string;
	}): Promise<
		| { readonly ok: true; readonly value: readonly string[] }
		| { readonly ok: false; readonly error: DispatchGatewayError }
	>;
	/** Read the remote's tip for a branch (missing when never pushed). */
	readRemoteBranchTip(options: {
		readonly cwd: string;
		readonly branch: string;
	}): Promise<DispatchRemoteBranchTipResult>;
	/** Push the source branch so the dispatched head is remotely reachable. */
	pushSourceBranch(options: {
		readonly cwd: string;
		readonly branch: string;
	}): Promise<DispatchGitOperationResult>;
	/** Push the exact dispatched revision to the new anchor branch ref. */
	pushAnchorBranch(options: {
		readonly cwd: string;
		readonly revision: string;
		readonly anchorBranch: string;
	}): Promise<DispatchGitOperationResult>;
}

export type DispatchSourceRefResult =
	| {
			readonly ok: true;
			readonly value: {
				readonly repoRoot: string;
				readonly branch: string;
				readonly headSha: string;
			};
	  }
	| {
			readonly ok: false;
			readonly error: {
				readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
				readonly message: string;
			};
	  };

export type DispatchRemoteBranchTipResult =
	| { readonly type: "found"; readonly sha: string }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: DispatchGatewayError };

export type DispatchGitOperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: DispatchGatewayError };

/**
 * The anchor PR surface on the user's own GitHub credentials: open the PR
 * up front and stamp the workflow run id on it after submission. The real
 * adapter drives the `gh` CLI in the repository.
 */
export interface DispatchAnchorPrGateway {
	openAnchorPr(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	}): Promise<DispatchOpenAnchorPrResult>;
	stampAnchorPrRunId(options: {
		readonly cwd: string;
		readonly prNumber: number;
		readonly runId: string;
	}): Promise<DispatchGitOperationResult>;
}

export type DispatchOpenAnchorPrResult =
	| { readonly ok: true; readonly value: { readonly number: number; readonly url: string } }
	| { readonly ok: false; readonly error: DispatchGatewayError };

/**
 * The authenticated trigger/observe surface on the dispatch deployable.
 * The caller's Development OIDC token travels on the dispatch-owned
 * header; it is opaque pass-through data here and must never appear in
 * results, logs, or errors.
 */
export interface DispatchTriggerGateway {
	/**
	 * Read-only identity preflight: an authenticated run-status read for a
	 * run id that cannot exist. `authorized` means the deployment answered
	 * 404 run-not-found — the route is reachable and accepted the caller's
	 * identity — without starting anything or costing compute.
	 */
	checkTriggerIdentity(options: {
		readonly deploymentUrl: string;
		readonly oidcToken: string;
	}): Promise<DispatchTriggerIdentityResult>;
	/** Start the dispatch workflow run; returns the run id to stamp. */
	startDispatchRun(options: {
		readonly deploymentUrl: string;
		readonly oidcToken: string;
		readonly input: DispatchRunInput;
	}): Promise<DispatchStartRunResult>;
}

export type DispatchTriggerIdentityResult =
	| { readonly type: "authorized" }
	| { readonly type: "unauthorized" }
	| { readonly type: "forbidden" }
	| { readonly type: "endpoint-misconfigured" }
	| { readonly type: "unreachable"; readonly message: string }
	| { readonly type: "unexpected-response"; readonly status: number };

export type DispatchStartRunResult =
	| { readonly ok: true; readonly value: { readonly runId: string } }
	| {
			readonly ok: false;
			readonly error: {
				readonly code:
					| "invalid-request"
					| "unauthorized"
					| "forbidden"
					| "endpoint-misconfigured"
					| "workflow-start-failed"
					| "unreachable"
					| "unexpected-response";
				readonly message: string;
			};
	  };

/**
 * The local Development-OIDC token source (README "Setup": `vercel link`
 * + `vercel env pull` provide `VERCEL_OIDC_TOKEN` in the deployable
 * package's gitignored `.env.local`). Presence is checked by name; the
 * value is used only as the trigger-call credential and never echoed.
 */
export interface DispatchLocalTokenGateway {
	readDevelopmentOidcToken(): Promise<DispatchLocalTokenResult>;
}

export type DispatchLocalTokenResult =
	| { readonly type: "found"; readonly token: string }
	| { readonly type: "missing"; readonly detail: string }
	| { readonly type: "error"; readonly message: string };

/**
 * The repo's dispatch settings source (`ns.toml` `[dispatch]`), read from
 * the repo root; parsing stays pure in the core.
 */
export interface DispatchConfigGateway {
	readDispatchSettingsSource(options: {
		readonly repoRoot: string;
	}): Promise<DispatchConfigSourceResult>;
}

export type DispatchConfigSourceResult =
	| { readonly type: "found"; readonly source: string }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly message: string };

/** Everything the dispatch-prompt core needs injected. */
export interface DispatchPromptGateways {
	readonly git: DispatchWorkspaceGitGateway;
	readonly anchorPrs: DispatchAnchorPrGateway;
	readonly trigger: DispatchTriggerGateway;
	readonly tokens: DispatchLocalTokenGateway;
	readonly config: DispatchConfigGateway;
	/** Short unique suffix for anchor branch names (non-deterministic). */
	readonly generateAnchorId: () => string;
}
