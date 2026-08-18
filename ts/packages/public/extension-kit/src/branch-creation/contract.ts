import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export type KnownBranchCreationProviderId = "plain-git" | "graphite";
export type BranchCreationProviderId = KnownBranchCreationProviderId | (string & {});

export interface BranchCreationRequest {
	cwd: string;
	targetBranch: string;
	startPoint: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface BranchCreationErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BranchCreationProviderResult =
	| { ok: true }
	| {
			ok: false;
			error: BranchCreationErrorInfo;
			/** True when the provider reports that the named Git branch was created before it failed. */
			branchCreated: boolean;
	  };

export interface BranchCreationProvider<
	TProviderId extends BranchCreationProviderId = BranchCreationProviderId,
> {
	readonly id: TProviderId;
	createBranch(request: BranchCreationRequest): Promise<BranchCreationProviderResult>;
}

export interface BranchCreationGitGateway {
	localBranchPresence(params: {
		cwd: string;
		branch: string;
		signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<
		| { type: "present"; refName: string; displayCommand: string }
		| { type: "absent"; refName: string }
		| { type: "error"; error: BranchCreationErrorInfo }
	>;
	listLocalBranchTips(params: {
		cwd: string;
		signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<
		| { ok: true; value: readonly { name: string; headSha?: string | null }[] }
		| { ok: false; error: BranchCreationErrorInfo }
	>;
}

export type BranchCreationOutcome =
	| {
			type: "created";
			providerId: BranchCreationProviderId;
			targetBranch: string;
			startPoint: string;
			refName: string;
	  }
	| {
			type: "failed";
			providerId: BranchCreationProviderId;
			targetBranch: string;
			startPoint: string;
			stage: "collision" | "provider" | "postcondition";
			branchObserved: boolean;
			error: BranchCreationErrorInfo;
	  };
