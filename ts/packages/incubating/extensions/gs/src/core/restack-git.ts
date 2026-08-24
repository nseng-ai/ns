export type GsGitOperation = "none" | "rebase" | "merge" | "cherry-pick" | "revert" | "bisect";

export interface GsCheckoutFacts {
	readonly branch: string | null;
	readonly head: string;
}

export interface GsGitState {
	readonly checkout: GsCheckoutFacts;
	readonly operation: GsGitOperation;
	readonly clean: boolean;
	readonly unmergedPaths: readonly string[];
	readonly hasStagedChanges: boolean;
}

export interface GsBranchRef {
	readonly name: string;
	readonly sha: string;
}

export interface GsWorktreeOccupancy {
	readonly branch: string;
	readonly path: string;
}

export interface GsGitFailure {
	readonly command: string;
	readonly message: string;
}

export type GsGitResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: GsGitFailure };

export interface GsRestackGitGateway {
	readState(): Promise<GsGitResult<GsGitState>>;
	readBranchRefs(branches: readonly string[]): Promise<GsGitResult<readonly GsBranchRef[]>>;
	readWorktreeOccupancy(): Promise<GsGitResult<readonly GsWorktreeOccupancy[]>>;
	isAncestor(ancestor: string, descendant: string): Promise<GsGitResult<boolean>>;
}
