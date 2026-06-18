import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { WorktreeStatusIdentity } from "@asdl/ccc/worktree-status";

export interface GitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

export function findGitPaths(cwd: string): GitPaths | undefined {
	let dir = resolve(cwd);
	for (;;) {
		const gitPath = join(dir, ".git");
		if (existsSync(gitPath)) {
			try {
				const stat = statSync(gitPath);
				if (stat.isFile()) {
					const content = readFileSync(gitPath, "utf8").trim();
					if (content.startsWith("gitdir: ")) {
						const gitDir = resolve(dir, content.slice(8).trim());
						const headPath = join(gitDir, "HEAD");
						if (!existsSync(headPath)) return undefined;

						const commonDirPath = join(gitDir, "commondir");
						const commonGitDir = existsSync(commonDirPath)
							? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim())
							: gitDir;
						return { repoDir: dir, gitDir, commonGitDir, headPath };
					}
				} else if (stat.isDirectory()) {
					const headPath = join(gitPath, "HEAD");
					if (!existsSync(headPath)) return undefined;
					return { repoDir: dir, gitDir: gitPath, commonGitDir: gitPath, headPath };
				}
			} catch {
				return undefined;
			}
		}

		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

export function currentBranchName(gitPaths: GitPaths): string | undefined {
	try {
		const head = readFileSync(gitPaths.headPath, "utf8").trim();
		const refPrefix = "ref: refs/heads/";
		if (!head.startsWith(refPrefix)) return undefined;

		const branch = head.slice(refPrefix.length).trim();
		return branch.length > 0 ? branch : undefined;
	} catch {
		return undefined;
	}
}

export function isSharedIdentityStillCurrent(
	cwd: string,
	identity: WorktreeStatusIdentity,
): boolean {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths === undefined) return identity.head.type === "unknown";
	const currentBranch = currentBranchName(gitPaths);
	if (identity.head.type !== "branch") return currentBranch === undefined;
	if (currentBranch !== identity.head.name) return false;

	const currentOid = currentBranchLooseOid(gitPaths, identity.head.name);
	return (
		currentOid === undefined || identity.headOid === undefined || currentOid === identity.headOid
	);
}

function currentBranchLooseOid(gitPaths: GitPaths, branch: string): string | undefined {
	const refPath = join(gitPaths.commonGitDir, "refs", "heads", ...branch.split("/"));
	if (!existsSync(refPath)) return undefined;
	try {
		const oid = readFileSync(refPath, "utf8").trim();
		return oid.length > 0 ? oid : undefined;
	} catch {
		return undefined;
	}
}
