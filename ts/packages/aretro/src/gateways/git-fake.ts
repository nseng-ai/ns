import type { GitResult } from "@asdl/core/git";

import type { AretroGitGateway, AretroGitParams } from "./git.ts";

export interface FakeAretroGitGatewayState {
	gitCommonDir?: string | null | undefined;
	repoRoot?: string | { code: string; message: string } | undefined;
	currentBranch?: string | { code: string; message: string } | undefined;
}

export class FakeAretroGitGateway implements AretroGitGateway {
	private readonly gitCommonDirState: string | null;
	private readonly repoRootState: string | { code: string; message: string };
	private readonly currentBranchState: string | { code: string; message: string };

	readonly calls: {
		getGitCommonDir: AretroGitParams[];
		getRepositoryRoot: AretroGitParams[];
		getCurrentBranch: AretroGitParams[];
	} = {
		getGitCommonDir: [],
		getRepositoryRoot: [],
		getCurrentBranch: [],
	};

	constructor(state: FakeAretroGitGatewayState = {}) {
		this.gitCommonDirState = state.gitCommonDir !== undefined ? state.gitCommonDir : "/repo/.git";
		this.repoRootState = state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/retro";
	}

	async getGitCommonDir(params: AretroGitParams): Promise<string | null> {
		this.calls.getGitCommonDir.push({ ...params });
		return this.gitCommonDirState;
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
