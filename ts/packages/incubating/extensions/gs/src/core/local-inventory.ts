export interface GsLocalPullRequest {
	readonly number: number;
	readonly recordedMerged: boolean;
}

export interface GsLocalBranch {
	readonly name: string;
	readonly pullRequest: GsLocalPullRequest | null;
}

export interface GsLocalStack {
	readonly number: number | null;
	readonly base: string;
	/** Branches in restack-recorded bottom-to-top order. */
	readonly branches: readonly GsLocalBranch[];
}

export interface GsRecordedStacks {
	readonly stacks: readonly GsLocalStack[];
}

export interface GsLocalInventory extends GsRecordedStacks {
	/** Canonical Git directory for the provider state of the invoking worktree. */
	readonly providerWorktreeGitDir: string;
}

export type GsLocalInventoryFailureCode =
	| "git-repository-unavailable"
	| "gh-stack-state-read-failed"
	| "gh-stack-state-unsupported";

export interface GsLocalInventoryFailure {
	readonly type: GsLocalInventoryFailureCode;
	readonly message: string;
}

export type GsLocalInventoryResult =
	| { readonly ok: true; readonly value: GsLocalInventory }
	| { readonly ok: false; readonly error: GsLocalInventoryFailure };

export interface GsLocalInventoryOptions {
	readonly cwd: string;
}

/** Reads the complete local gh-stack inventory for a Git repository. */
export interface GsLocalInventoryGateway {
	readLocalInventory(options: GsLocalInventoryOptions): Promise<GsLocalInventoryResult>;
}

export function copyGsLocalInventory(inventory: GsLocalInventory): GsLocalInventory {
	return {
		providerWorktreeGitDir: inventory.providerWorktreeGitDir,
		stacks: inventory.stacks.map((stack) => ({
			number: stack.number,
			base: stack.base,
			branches: stack.branches.map((branch) => ({
				name: branch.name,
				pullRequest:
					branch.pullRequest === null
						? null
						: {
								number: branch.pullRequest.number,
								recordedMerged: branch.pullRequest.recordedMerged,
							},
			})),
		})),
	};
}
