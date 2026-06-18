import { basename, resolve } from "node:path";

import { mainRepoRootFromGitCommonDir, type SlotGitGateway } from "./gateways/git.ts";
import type { SlotStorageGateway } from "./gateways/storage.ts";

export const DEFAULT_SLOTS_ROOT = "~/.slots";

export interface RepoContext {
	type: "repo";
	root: string;
	mainRepoRoot: string;
	repoName: string;
	repoDir: string;
	worktreesDir: string;
}

export interface NoRepoSentinel {
	type: "no_repo";
	message: string;
	errorType: "not_in_repo" | "missing_start_path";
}

export type RepoDiscoveryResult = RepoContext | NoRepoSentinel;

export async function discoverRepoOrSentinel(options: {
	cwd: string;
	slotsRoot: string;
	git: SlotGitGateway;
}): Promise<RepoDiscoveryResult> {
	const cwd = resolve(options.cwd);
	if (!(await options.git.pathExists(cwd))) {
		return {
			type: "no_repo",
			errorType: "missing_start_path",
			message: `Start path '${cwd}' does not exist`,
		};
	}
	const gitCommonDir = await options.git.getGitCommonDir(cwd);
	if (gitCommonDir === null) {
		return {
			type: "no_repo",
			errorType: "not_in_repo",
			message: "Not inside a git repository (no .git found up the tree)",
		};
	}
	const mainRepoRoot = resolve(mainRepoRootFromGitCommonDir(gitCommonDir));
	const root = resolve(await options.git.getRepositoryRoot(cwd));
	const repoName = basename(mainRepoRoot);
	const repoDir = resolve(options.slotsRoot, "repos", repoName);
	const worktreesDir = resolve(repoDir, "worktrees");
	return { type: "repo", root, mainRepoRoot, repoName, repoDir, worktreesDir };
}

export async function ensureSlotsMetadataDir(
	repo: RepoContext,
	storage: SlotStorageGateway,
): Promise<void> {
	await storage.ensureDir(repo.repoDir);
	await storage.ensureDir(repo.worktreesDir);
}
