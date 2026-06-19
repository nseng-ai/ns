import type { GitResult } from "@asdl/core/git";

export interface AretroGitParams {
	cwd: string;
}

export interface AretroGitGateway {
	/**
	 * Return whether cwd is inside a git repository.
	 */
	isGitRepository(params: AretroGitParams): Promise<boolean>;

	/**
	 * Get the repository root (top-level working directory).
	 */
	getRepositoryRoot(params: AretroGitParams): Promise<GitResult<string>>;

	/**
	 * Get the current branch name.
	 * Returns detached_head error if in detached HEAD state.
	 */
	getCurrentBranch(params: AretroGitParams): Promise<GitResult<string>>;
}
