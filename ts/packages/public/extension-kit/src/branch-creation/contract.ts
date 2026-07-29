import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export const BUILT_IN_BRANCH_CREATION_MODES = ["plain-git", "graphite"] as const;
export type BuiltInBranchCreationMode = (typeof BUILT_IN_BRANCH_CREATION_MODES)[number];

export type BranchCreationBasis =
	| { type: "current-head" }
	| { type: "explicit"; startPoint: string; startRef: string; parentBranch?: string };

export type BranchCreationRelationship =
	| { type: "none" }
	| { type: "tracked-parent"; parentBranch: string };

export interface BranchCreationEvidence {
	startPoint: string;
	startRef: string;
	relationship: BranchCreationRelationship;
}

export interface BranchCreationRequest {
	cwd: string;
	branch: string;
	basis: BranchCreationBasis;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface BranchCreationError {
	code: string;
	message: string;
	branchCreated: boolean;
}

export type BranchCreationResult =
	| { ok: true; value: BranchCreationEvidence }
	| { ok: false; error: BranchCreationError };

export interface BranchCreationProvider {
	readonly mode: BuiltInBranchCreationMode;
	createBranch(request: BranchCreationRequest): Promise<BranchCreationResult>;
}

export type BranchCreationGitGateway = Pick<
	GitGateway,
	"createBranchAtStartPoint" | "localBranchPresence" | "currentBranch" | "headCommit"
>;
