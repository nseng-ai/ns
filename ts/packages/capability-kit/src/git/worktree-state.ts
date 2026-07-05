import { existsSync, readFileSync, statSync, type Stats } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const HEADS_REF_PREFIX = "refs/heads/";

export type GitOperationInProgress = "merge" | "cherry-pick" | "revert" | "rebase" | "bisect";

export interface GitOperationInProgressFacts {
	operation: GitOperationInProgress;
	branch: string | null;
}

export interface GitWorktreeDirs {
	gitDir: string;
	commonGitDir: string;
	headPath: string;
	hasHead: boolean;
}

export type GitWorktreeGitDirsResolution =
	| { type: "resolved"; dirs: GitWorktreeDirs }
	| { type: "no-dot-git" }
	| { type: "not-gitdir-file" }
	| { type: "unreadable"; path: string; error: unknown };

export interface GitWorktreeStateFs {
	pathKind(path: string): "file" | "directory" | "missing";
	readTextFile(path: string): string;
}

export interface GitWorktreeStateOptions {
	fs?: GitWorktreeStateFs;
}

export const nodeGitWorktreeStateFs: GitWorktreeStateFs = {
	pathKind(path) {
		return nodePathKind(path);
	},
	readTextFile(path) {
		return readFileSync(path, "utf8");
	},
};

const OPERATION_MARKERS: readonly {
	operation: GitOperationInProgress;
	paths: readonly string[];
}[] = [
	{ operation: "merge", paths: ["MERGE_HEAD"] },
	{ operation: "cherry-pick", paths: ["CHERRY_PICK_HEAD"] },
	{ operation: "revert", paths: ["REVERT_HEAD"] },
	{ operation: "rebase", paths: ["rebase-merge", "rebase-apply"] },
	{ operation: "bisect", paths: ["BISECT_LOG"] },
];

export function resolveWorktreeGitDirs(
	worktreePath: string,
	options: GitWorktreeStateOptions = {},
): GitWorktreeGitDirsResolution {
	const fs = options.fs ?? nodeGitWorktreeStateFs;
	const dotGit = resolve(worktreePath, ".git");
	let dotGitKind: ReturnType<GitWorktreeStateFs["pathKind"]>;
	try {
		dotGitKind = fs.pathKind(dotGit);
	} catch (error) {
		return { type: "unreadable", path: dotGit, error };
	}

	if (dotGitKind === "missing") return { type: "no-dot-git" };
	if (dotGitKind === "directory") return resolvedDirs(fs, dotGit, dotGit);
	if (dotGitKind !== "file") return { type: "not-gitdir-file" };

	let content: string;
	try {
		content = fs.readTextFile(dotGit).trim();
	} catch (error) {
		return { type: "unreadable", path: dotGit, error };
	}

	const prefix = "gitdir:";
	if (!content.startsWith(prefix)) return { type: "not-gitdir-file" };
	const rawGitDir = content.slice(prefix.length).trim();
	if (rawGitDir.length === 0) return { type: "not-gitdir-file" };
	const gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(worktreePath, rawGitDir);
	return resolvedDirs(fs, gitDir, gitDir);
}

export function detectGitOperationInProgress(
	gitDir: string,
	options: GitWorktreeStateOptions = {},
): GitOperationInProgressFacts | undefined {
	const fs = options.fs ?? nodeGitWorktreeStateFs;
	for (const marker of OPERATION_MARKERS) {
		for (const markerPath of marker.paths) {
			if (pathExists(fs, resolve(gitDir, markerPath))) {
				return {
					operation: marker.operation,
					branch: operationBranch(fs, gitDir, marker.operation),
				};
			}
		}
	}
	return undefined;
}

export function detectGitOperationInProgressAt(
	worktreePath: string,
	options: GitWorktreeStateOptions = {},
): GitOperationInProgressFacts | undefined {
	const resolution = resolveWorktreeGitDirs(worktreePath, options);
	if (resolution.type !== "resolved") return undefined;
	return detectGitOperationInProgress(resolution.dirs.gitDir, options);
}

function resolvedDirs(
	fs: GitWorktreeStateFs,
	gitDir: string,
	defaultCommonGitDir: string,
): GitWorktreeGitDirsResolution {
	const headPath = join(gitDir, "HEAD");
	const hasHead = pathExists(fs, headPath);
	const commonDirPath = join(gitDir, "commondir");
	let commonGitDir = defaultCommonGitDir;
	if (pathExists(fs, commonDirPath)) {
		try {
			const rawCommonDir = fs.readTextFile(commonDirPath).trim();
			if (rawCommonDir.length > 0) {
				commonGitDir = isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir);
			}
		} catch (error) {
			return { type: "unreadable", path: commonDirPath, error };
		}
	}
	return { type: "resolved", dirs: { gitDir, commonGitDir, headPath, hasHead } };
}

function operationBranch(
	fs: GitWorktreeStateFs,
	gitDir: string,
	operation: GitOperationInProgress,
): string | null {
	if (operation !== "rebase") return null;
	return (
		branchFromRefFile(fs, resolve(gitDir, "rebase-merge", "head-name")) ??
		branchFromRefFile(fs, resolve(gitDir, "rebase-apply", "head-name"))
	);
}

function branchFromRefFile(fs: GitWorktreeStateFs, path: string): string | null {
	if (!pathExists(fs, path)) return null;
	let raw: string;
	try {
		raw = fs.readTextFile(path);
	} catch {
		return null;
	}
	const ref = raw
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (ref === undefined) return null;
	return ref.startsWith(HEADS_REF_PREFIX) ? ref.slice(HEADS_REF_PREFIX.length) : ref;
}

function pathExists(fs: GitWorktreeStateFs, path: string): boolean {
	try {
		return fs.pathKind(path) !== "missing";
	} catch {
		return false;
	}
}

function nodePathKind(path: string): "file" | "directory" | "missing" {
	if (!existsSync(path)) return "missing";
	let stats: Stats;
	try {
		stats = statSync(path);
	} catch {
		return "missing";
	}
	if (stats.isDirectory()) return "directory";
	if (stats.isFile()) return "file";
	return "missing";
}
