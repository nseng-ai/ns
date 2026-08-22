export interface GhStackStatus {
	readonly merged: number;
	readonly open: number;
	readonly closed: number;
	readonly unpushed: number;
}

export interface GhStackInventoryItem {
	readonly number: number | null;
	readonly branches: readonly string[];
	readonly bottomBranch: string;
	readonly topBranch: string;
	readonly base: string;
	readonly type: "local" | "remote";
	readonly status: GhStackStatus;
	readonly createdAt: string | null;
}

export interface GhStackInventory {
	readonly stacks: readonly GhStackInventoryItem[];
	readonly limit: number;
	readonly returned: number;
	readonly total: number;
	readonly truncated: boolean;
}

export interface LocalPullRequest {
	readonly number: number;
	readonly merged: boolean;
}

export interface LocalBranch {
	readonly name: string;
	readonly pullRequest: LocalPullRequest | null;
}

export interface LocalStack {
	readonly id: string | null;
	readonly number: number | null;
	readonly base: string;
	readonly branches: readonly LocalBranch[];
}

export interface RemotePullRequest {
	readonly number: number;
	readonly state: "open" | "closed";
	readonly mergedAt: string | null;
	readonly branch: string;
}

export interface RemoteStack {
	readonly id: string;
	readonly number: number;
	readonly base: string;
	readonly createdAt: string;
	readonly pullRequests: readonly RemotePullRequest[];
}

export interface GhStackFailureEvidence {
	readonly command?: string;
	readonly cwd?: string;
	readonly summary?: string;
	readonly detail?: string;
}

export type GhStackInventoryFailure =
	| { readonly type: "gh-stack-extension-unavailable"; readonly evidence: GhStackFailureEvidence }
	| { readonly type: "git-repository-unavailable"; readonly evidence: GhStackFailureEvidence }
	| { readonly type: "gh-stack-state-read-failed"; readonly evidence: GhStackFailureEvidence }
	| { readonly type: "gh-stack-state-unsupported"; readonly evidence: GhStackFailureEvidence }
	| { readonly type: "github-stack-discovery-failed"; readonly evidence: GhStackFailureEvidence }
	| { readonly type: "github-stacks-unavailable"; readonly evidence: GhStackFailureEvidence }
	| {
			readonly type: "github-stack-response-unsupported";
			readonly evidence: GhStackFailureEvidence;
	  }
	| { readonly type: "gh-stack-reconciliation-failed"; readonly evidence: GhStackFailureEvidence };

export type GhStackInventoryResult =
	| { readonly ok: true; readonly value: GhStackInventory }
	| { readonly ok: false; readonly error: GhStackInventoryFailure };

export type LocalStackInventoryResult =
	| { readonly ok: true; readonly value: readonly LocalStack[] }
	| {
			readonly ok: false;
			readonly error: Extract<
				GhStackInventoryFailure,
				{
					readonly type:
						| "git-repository-unavailable"
						| "gh-stack-state-read-failed"
						| "gh-stack-state-unsupported";
				}
			>;
	  };

export type RemoteStackInventoryResult =
	| { readonly ok: true; readonly value: readonly RemoteStack[] }
	| {
			readonly ok: false;
			readonly error: Extract<
				GhStackInventoryFailure,
				{
					readonly type:
						| "github-stack-discovery-failed"
						| "github-stacks-unavailable"
						| "github-stack-response-unsupported";
				}
			>;
	  };

export type InstallationVerificationResult =
	| { readonly ok: true; readonly version: string }
	| {
			readonly ok: false;
			readonly error: Extract<
				GhStackInventoryFailure,
				{ readonly type: "gh-stack-extension-unavailable" }
			>;
	  };
