const GIT_TIMEOUT_MS = 5_000;

interface ExecRuntime {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<{ code: number; stdout: string; stderr: string; killed?: boolean }>;
}

export async function getWorktreeDescription(
	pi: ExecRuntime,
	worktreePath: string,
	branchName: string,
): Promise<string> {
	const repoName = await getGitRepositoryName(pi, worktreePath);
	return repoName ? `${repoName}/${branchName}` : branchName;
}

export async function getGitRepositoryName(
	pi: ExecRuntime,
	cwd: string,
): Promise<string | undefined> {
	const remote = await pi.exec("git", ["remote", "get-url", "origin"], { cwd, timeout: GIT_TIMEOUT_MS });
	if (remote.code === 0) {
		const repoName = repositoryNameFromPath(remote.stdout.trim());
		if (repoName) {
			return repoName;
		}
	}

	const commonDir = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (commonDir.code !== 0) {
		return undefined;
	}

	return repositoryNameFromGitCommonDir(commonDir.stdout.trim());
}

export function repositoryNameFromGitCommonDir(path: string): string | undefined {
	const normalized = path.replace(/[\\/]+$/, "");
	if (normalized.length === 0) {
		return undefined;
	}

	const base = basenameForAnyPath(normalized);
	if (base === ".git") {
		return basenameForAnyPath(dirnameForAnyPath(normalized)) || undefined;
	}
	return stripGitSuffix(base) || undefined;
}

export function repositoryNameFromPath(path: string): string | undefined {
	const normalized = path.trim().replace(/[\\/]+$/, "");
	if (normalized.length === 0) {
		return undefined;
	}

	const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf(":"));
	return stripGitSuffix(normalized.slice(separatorIndex + 1)) || undefined;
}

function stripGitSuffix(value: string): string {
	return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function basenameForAnyPath(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] ?? "";
}

function dirnameForAnyPath(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
	return separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : "";
}
