export type GsGitOperation = "none" | "rebase" | "merge" | "cherry-pick" | "revert" | "bisect";

export interface GsRestackGitState {
	readonly branch: string | null;
	readonly operation: GsGitOperation;
	readonly clean: boolean;
	readonly unmergedPaths: readonly string[];
	readonly hasStagedChanges: boolean;
}

export interface GsGitInspectionFailure {
	readonly command: string;
	readonly message: string;
}

export type GsGitInspectionResult =
	| { readonly ok: true; readonly state: GsRestackGitState }
	| { readonly ok: false; readonly failure: GsGitInspectionFailure };

export interface GsRestackGitGateway {
	inspect(): Promise<GsGitInspectionResult>;
}
