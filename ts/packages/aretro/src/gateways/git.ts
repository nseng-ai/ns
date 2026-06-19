import type { GitResult } from "@asdl/core/git";

export interface AretroGitParams {
	cwd: string;
}

export interface AretroGitGateway {
	/**
	 * Get the git common directory (usually .git or .git/worktrees/<name>).
	 * Returns null if cwd is not in a git repository.
	 */
	getGitCommonDir(params: AretroGitParams): Promise<string | null>;

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
