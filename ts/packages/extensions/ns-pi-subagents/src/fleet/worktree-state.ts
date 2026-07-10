import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	commandFailureReason,
	commandSucceeded,
	type CommandExecApi,
	type ExecOptions,
} from "@nseng-ai/foundation/exec";

import { conciseGitFailureReason } from "./git-output.ts";

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
	statusPorcelain: string;
	unstagedNumstat: string;
	stagedNumstat: string;
}

export function parseWorktreeState(input: ParseWorktreeStateInput): WorktreeStateSnapshot {
	const byPath = new Map<string, WorktreeStateFile>();
	for (const file of parseStatusPorcelain(input.statusPorcelain)) {
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

export function createGitReadWorktreeState(input: { exec: CommandExecApi }): ReadWorktreeState {
	return async ({ cwd }) => {
		try {
			const results = await Promise.all([
				runGit(input.exec, cwd, ["status", "--porcelain", "-z"]),
				runGit(input.exec, cwd, ["diff", "--numstat", "--no-renames", "--"]),
				runGit(input.exec, cwd, ["diff", "--cached", "--numstat", "--no-renames", "--"]),
			]);
			const failureReason = firstGitReadFailureReason(results);
			if (failureReason !== undefined) {
				return { status: "unavailable", reason: failureReason };
			}
			if (!allGitReadsSucceeded(results)) {
				return { status: "unavailable", reason: "git read results were incomplete" };
			}
			const [statusPorcelain, unstagedNumstat, stagedNumstat] = results;
			return parseWorktreeState({
				statusPorcelain: statusPorcelain.stdout,
				unstagedNumstat: unstagedNumstat.stdout,
				stagedNumstat: stagedNumstat.stdout,
			});
		} catch (error) {
			return { status: "unavailable", reason: conciseGitFailureReason(formatErrorMessage(error)) };
		}
	};
}

function parseStatusPorcelain(output: string): WorktreeStateFile[] {
	const files: WorktreeStateFile[] = [];
	const records = output.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index] ?? "";
		if (record.length === 0) continue;
		if (record.length < 4 || record[2] !== " ") continue;
		const rawStatus = record.slice(0, 2);
		const status = rawStatus.trim().length === 0 ? rawStatus : rawStatus.trim();
		const path = record.slice(3);
		if (path.length === 0) continue;
		files.push({ path, ...(status.length === 0 ? {} : { status }) });
		if (rawStatus.includes("R") || rawStatus.includes("C")) index += 1;
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

type GitReadSuccess = { status: "ok"; stdout: string };
type GitReadResult = GitReadSuccess | { status: "failed"; reason: string };

function firstGitReadFailureReason(results: readonly GitReadResult[]): string | undefined {
	return results.find((result) => result.status === "failed")?.reason;
}

function allGitReadsSucceeded(
	results: readonly GitReadResult[],
): results is [GitReadSuccess, GitReadSuccess, GitReadSuccess] {
	return results.length === 3 && results.every((result) => result.status === "ok");
}

async function runGit(
	exec: CommandExecApi,
	cwd: string,
	args: readonly string[],
): Promise<GitReadResult> {
	const result = await exec.exec("git", [...args], gitExecOptions(cwd));
	if (commandSucceeded(result)) return { status: "ok", stdout: result.stdout };
	return { status: "failed", reason: conciseGitFailureReason(commandFailureReason(result)) };
}

function gitExecOptions(cwd: string): ExecOptions {
	return { cwd, timeout: GIT_WORKTREE_STATE_TIMEOUT_MS };
}
