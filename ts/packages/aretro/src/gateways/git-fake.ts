import type { GitResult } from "@asdl/core/git";

import type { AretroGitGateway, AretroGitParams } from "./git.ts";

export interface FakeAretroGitGatewayState {
	isGitRepo?: boolean | undefined;
	repoRoot?: string | { code: string; message: string } | undefined;
	currentBranch?: string | { code: string; message: string } | undefined;
}

export class FakeAretroGitGateway implements AretroGitGateway {
	private readonly isGitRepoState: boolean;
	private readonly repoRootState: string | { code: string; message: string };
	private readonly currentBranchState: string | { code: string; message: string };

	readonly calls: {
		isGitRepository: AretroGitParams[];
		getRepositoryRoot: AretroGitParams[];
		getCurrentBranch: AretroGitParams[];
	} = {
		isGitRepository: [],
		getRepositoryRoot: [],
		getCurrentBranch: [],
	};

	constructor(state: FakeAretroGitGatewayState = {}) {
		this.isGitRepoState = state.isGitRepo ?? true;
		this.repoRootState = state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/retro";
	}

	async isGitRepository(params: AretroGitParams): Promise<boolean> {
		this.calls.isGitRepository.push({ ...params });
		return this.isGitRepoState;
	}

	async getRepositoryRoot(params: AretroGitParams): Promise<GitResult<string>> {
		this.calls.getRepositoryRoot.push({ ...params });
		if (typeof this.repoRootState === "string") {
			return { ok: true, value: this.repoRootState };
		}
		return { ok: false, error: this.repoRootState };
	}

	async getCurrentBranch(params: AretroGitParams): Promise<GitResult<string>> {
		this.calls.getCurrentBranch.push({ ...params });
		if (typeof this.currentBranchState === "string") {
			return { ok: true, value: this.currentBranchState };
		}
		return { ok: false, error: this.currentBranchState };
	}
}
