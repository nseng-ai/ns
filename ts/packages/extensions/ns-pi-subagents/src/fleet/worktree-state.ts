import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { ExecOptions, PiExecApiLike } from "@nseng-ai/foundation/exec";

const GIT_WORKTREE_STATE_TIMEOUT_MS = 2_000;

export interface WorktreeStateFile {
	path: string;
	status?: string;
	additions?: number;
	deletions?: number;
	isBinary?: boolean;
}

export type WorktreeStateSnapshot =
	| { status: "available"; files: readonly WorktreeStateFile[] }
	| { status: "unavailable"; reason: string };

export type ReadWorktreeState = (input: { cwd: string }) => Promise<WorktreeStateSnapshot>;

interface GitNumstatEntry {
	path: string;
	additions?: number;
	deletions?: number;
	isBinary?: boolean;
}

export interface ParseWorktreeStateInput {
	statusShort: string;
	unstagedNumstat: string;
	stagedNumstat: string;
}

export function parseWorktreeState(input: ParseWorktreeStateInput): WorktreeStateSnapshot {
	const byPath = new Map<string, WorktreeStateFile>();
	for (const file of parseStatusShort(input.statusShort)) {
		byPath.set(file.path, file);
	}
	for (const stat of [
		...parseGitNumstat(input.unstagedNumstat),
		...parseGitNumstat(input.stagedNumstat),
	]) {
		const current = byPath.get(stat.path) ?? { path: stat.path };
		byPath.set(stat.path, mergeNumstat(current, stat));
	}
	return { status: "available", files: [...byPath.values()].sort(compareWorktreeStateFiles) };
}

export function createGitReadWorktreeState(input: { exec: PiExecApiLike }): ReadWorktreeState {
	return async ({ cwd }) => {
		try {
			const [statusShort, unstagedNumstat, stagedNumstat] = await Promise.all([
				runGit(input.exec, cwd, ["status", "--short"]),
				runGit(input.exec, cwd, ["diff", "--numstat", "--"]),
				runGit(input.exec, cwd, ["diff", "--cached", "--numstat", "--"]),
			]);
			if (statusShort.status === "failed") {
				return { status: "unavailable", reason: statusShort.reason };
			}
			if (unstagedNumstat.status === "failed") {
				return { status: "unavailable", reason: unstagedNumstat.reason };
			}
			if (stagedNumstat.status === "failed") {
				return { status: "unavailable", reason: stagedNumstat.reason };
			}
			return parseWorktreeState({
				statusShort: statusShort.stdout,
				unstagedNumstat: unstagedNumstat.stdout,
				stagedNumstat: stagedNumstat.stdout,
			});
		} catch (error) {
			return { status: "unavailable", reason: conciseReason(formatErrorMessage(error)) };
		}
	};
}

function parseStatusShort(output: string): WorktreeStateFile[] {
	const files: WorktreeStateFile[] = [];
	for (const rawLine of output.split("\n")) {
		const line = rawLine.trimEnd();
		if (line.length === 0) continue;
		const rawStatus = line.slice(0, 2);
		const status = rawStatus.trim().length === 0 ? rawStatus : rawStatus.trim();
		const path = line.length > 3 ? line.slice(3) : line.slice(2).trimStart();
		if (path.length === 0) continue;
		files.push({ path, ...(status.length === 0 ? {} : { status }) });
	}
	return files;
}

function parseGitNumstat(output: string): GitNumstatEntry[] {
	const entries: GitNumstatEntry[] = [];
	for (const rawLine of output.split("\n")) {
		const line = rawLine.trimEnd();
		if (line.length === 0) continue;
		const [additionsText, deletionsText, ...pathParts] = line.split("\t");
		const path = pathParts.join("\t");
		if (additionsText === undefined || deletionsText === undefined || path.length === 0) continue;
		if (additionsText === "-" || deletionsText === "-") {
			entries.push({ path, isBinary: true });
			continue;
		}
		const additions = Number.parseInt(additionsText, 10);
		const deletions = Number.parseInt(deletionsText, 10);
		if (!Number.isFinite(additions) || !Number.isFinite(deletions)) {
			entries.push({ path });
			continue;
		}
		entries.push({ path, additions, deletions });
	}
	return entries;
}

function mergeNumstat(file: WorktreeStateFile, stat: GitNumstatEntry): WorktreeStateFile {
	return {
		...file,
		...(stat.additions === undefined ? {} : { additions: (file.additions ?? 0) + stat.additions }),
		...(stat.deletions === undefined ? {} : { deletions: (file.deletions ?? 0) + stat.deletions }),
		...(stat.isBinary === undefined ? {} : { isBinary: file.isBinary === true || stat.isBinary }),
	};
}

function compareWorktreeStateFiles(left: WorktreeStateFile, right: WorktreeStateFile): number {
	return left.path.localeCompare(right.path);
}

type GitReadResult = { status: "ok"; stdout: string } | { status: "failed"; reason: string };

async function runGit(
	exec: PiExecApiLike,
	cwd: string,
	args: readonly string[],
): Promise<GitReadResult> {
	const result = await exec.exec("git", [...args], gitExecOptions(cwd));
	if (result.code === 0) return { status: "ok", stdout: result.stdout ?? "" };
	const output =
		result.stderr ?? result.stdout ?? result.startupError ?? `git exited ${result.code}`;
	return { status: "failed", reason: conciseReason(output) };
}

function gitExecOptions(cwd: string): ExecOptions {
	return { cwd, timeout: GIT_WORKTREE_STATE_TIMEOUT_MS };
}

function conciseReason(reason: string): string {
	const compact = reason.replace(/\s+/gu, " ").trim();
	if (compact.length === 0) return "git command failed";
	return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}
