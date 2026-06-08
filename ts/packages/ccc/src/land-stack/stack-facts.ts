import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { formatCommand } from "@asdl/pi-extension-runtime/command-runtime";
import { CURRENT_MARKER, GIT_TIMEOUT_MS, GT_TIMEOUT_MS, OTHER_MARKER } from "./constants.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { completed, failure, landStackFailure, success, type LandStackOutcome, type LandStackResult } from "./errors.ts";
import type { LandStackExtensionAPI, ParsedStackOutput, StackSnapshot } from "./types.ts";

export async function loadRepoRoot(pi: LandStackExtensionAPI, cwd: string): Promise<LandStackResult<string>> {
	const result = await exec(pi, "git", ["rev-parse", "--show-toplevel"], cwd, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(landStackFailure(`Not inside a git repository.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--show-toplevel"]))}`));
	}
	const root = result.stdout.trim();
	if (!root) {
		return failure(landStackFailure("git rev-parse --show-toplevel returned no repository root."));
	}
	return success(root);
}

export async function loadCurrentBranch(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackResult<string>> {
	const result = await exec(pi, "git", ["symbolic-ref", "--short", "HEAD"], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Detached HEAD; check out a branch before running /code:land-stack.\n${formatCommandDetails(result, formatCommand("git", ["symbolic-ref", "--short", "HEAD"]))}`,
			),
		);
	}
	const branch = result.stdout.trim();
	if (!branch) {
		return failure(landStackFailure("Could not resolve current branch before running /code:land-stack."));
	}
	return success(branch);
}

export async function loadTrunk(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackResult<string>> {
	const result = await exec(pi, "gt", ["trunk", "--no-interactive"], repoRoot, GT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(landStackFailure(`Could not resolve Graphite trunk.\n${formatCommandDetails(result, formatCommand("gt", ["trunk", "--no-interactive"]))}`));
	}
	const trunk = firstNonEmptyLine(result.stdout);
	if (!trunk) {
		return failure(landStackFailure("gt trunk --no-interactive returned no branch."));
	}
	return success(trunk);
}

export async function loadStackSnapshot(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	current: string,
	trunk: string,
): Promise<LandStackResult<StackSnapshot>> {
	const args = ["log", "short", "--stack", "-r", "--no-interactive"];
	const result = await exec(pi, "gt", args, repoRoot, GT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(landStackFailure(`Could not load Graphite stack.\n${formatCommandDetails(result, formatCommand("gt", args))}`));
	}

	const parsed = parseGtStackOutput(result.stdout);
	if (!parsed) {
		return failure(landStackFailure("gt log short --stack returned no current-branch marker; refusing to infer the stack from git history."));
	}
	if (parsed.current !== current) {
		return failure(landStackFailure(`Graphite stack current marker is ${parsed.current}, but git current branch is ${current}; refusing to continue.`));
	}

	const warnings = [...parsed.warnings];
	if (parsed.trunk !== trunk) {
		warnings.push(`gt log stack root is ${parsed.trunk}, but gt trunk is ${trunk}; ${trunk} remains the required merge target`);
	}

	const landingBranches = unique([...parsed.ancestors.filter((branch) => branch !== trunk), current].filter((branch) => branch !== trunk));
	const descendantBranches = unique(parsed.descendants.filter((branch) => branch !== current && branch !== trunk));

	return success({
		trunk,
		current,
		landingBranches,
		descendantBranches,
		warnings,
	});
}

export function parseGtStackOutput(stdout: string): ParsedStackOutput | undefined {
	const rawLines = stdout.split("\n").filter((line) => line.trim().length > 0);
	const entries: Array<{ lineIndex: number; col: number; marker: string; branch: string }> = [];

	for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
		const line = rawLines[lineIndex] ?? "";
		const position = markerPosition(line);
		if (!position) continue;
		const branch = branchNameFromLine(line, position.col);
		if (!branch) continue;
		entries.push({ lineIndex, col: position.col, marker: position.marker, branch });
	}

	const currentEntries = entries.filter((entry) => entry.marker === CURRENT_MARKER);
	if (currentEntries.length === 0) {
		return undefined;
	}

	const current = currentEntries[0];
	if (!current) return undefined;
	const warnings: string[] = [];
	if (currentEntries.length > 1) {
		warnings.push("multiple current markers found in gt log output");
	}

	const offColumn = entries.filter((entry) => entry.col !== current.col).length;
	if (offColumn > 0) {
		warnings.push(
			`${offColumn} branch(es) in gt log output sit outside the current branch's column and were not included in the stack walk`,
		);
	}

	const aligned = entries.filter((entry) => entry.col === current.col);
	const ancestors = aligned.filter((entry) => entry.lineIndex < current.lineIndex).map((entry) => entry.branch);
	const descendants = aligned.filter((entry) => entry.lineIndex > current.lineIndex).map((entry) => entry.branch);
	const trunk = ancestors[0] ?? current.branch;

	return {
		trunk,
		current: current.branch,
		ancestors,
		descendants,
		warnings,
	};
}

export function markerPosition(line: string): { col: number; marker: string } | undefined {
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === CURRENT_MARKER || char === OTHER_MARKER) {
			return { col: index, marker: char };
		}
	}
	return undefined;
}

export function branchNameFromLine(line: string, markerIndex: number): string {
	const tail = line.slice(markerIndex + 1).trimStart();
	const annotationIndex = tail.indexOf(" (");
	return (annotationIndex === -1 ? tail : tail.slice(0, annotationIndex)).trim();
}

export async function assertCleanRepo(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackOutcome> {
	const status = await exec(pi, "git", ["status", "--porcelain=v1"], repoRoot, GIT_TIMEOUT_MS);
	if (status.code !== 0) {
		return failure(landStackFailure(`Could not inspect working tree status.\n${formatCommandDetails(status, formatCommand("git", ["status", "--porcelain=v1"]))}`));
	}
	if (status.stdout.trim().length > 0) {
		return failure(landStackFailure("Working tree is dirty; refusing to start stack landing."));
	}

	const operation = await detectInProgressOperation(pi, repoRoot);
	if (operation) {
		return failure(landStackFailure(`${operation} is in progress; refusing to start stack landing.`));
	}
	return completed();
}

export async function detectInProgressOperation(pi: LandStackExtensionAPI, repoRoot: string): Promise<string | undefined> {
	const refs: Array<{ ref: string; label: string }> = [
		{ ref: "MERGE_HEAD", label: "A merge" },
		{ ref: "CHERRY_PICK_HEAD", label: "A cherry-pick" },
		{ ref: "REVERT_HEAD", label: "A revert" },
	];

	for (const { ref, label } of refs) {
		const result = await exec(pi, "git", ["rev-parse", "-q", "--verify", ref], repoRoot, GIT_TIMEOUT_MS);
		if (result.code === 0) {
			return label;
		}
	}

	// REBASE_HEAD can be left behind as a stale pseudo-ref after Git reports a
	// clean, normal worktree. Treat only Git's active rebase state directories as
	// authoritative for rebase detection.
	for (const dir of ["rebase-merge", "rebase-apply"]) {
		const pathResult = await exec(pi, "git", ["rev-parse", "--git-path", dir], repoRoot, GIT_TIMEOUT_MS);
		if (pathResult.code !== 0) continue;
		const gitPath = pathResult.stdout.trim();
		if (gitPath && existsSync(resolveGitPath(repoRoot, gitPath))) {
			return "A rebase";
		}
	}

	return undefined;
}

export function resolveGitPath(repoRoot: string, gitPath: string): string {
	return isAbsolute(gitPath) ? gitPath : resolve(repoRoot, gitPath);
}

export async function assertLocalBranchExists(pi: LandStackExtensionAPI, repoRoot: string, branch: string): Promise<LandStackOutcome> {
	const result = await exec(pi, "git", ["show-ref", "--verify", `refs/heads/${branch}`], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(landStackFailure(`Local branch ${branch} does not exist; refusing to start stack landing.\n${formatCommandDetails(result)}`));
	}
	return completed();
}

export async function loadLocalSha(pi: LandStackExtensionAPI, repoRoot: string, branch: string): Promise<LandStackResult<string>> {
	const ref = `refs/heads/${branch}^{commit}`;
	const result = await exec(pi, "git", ["rev-parse", "--verify", ref], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(landStackFailure(`Could not resolve local branch ${branch}.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--verify", ref]))}`));
	}
	const sha = result.stdout.trim();
	if (!sha) {
		return failure(landStackFailure(`git rev-parse returned no SHA for ${branch}.`));
	}
	return success(sha);
}

export function firstNonEmptyLine(output: string): string | undefined {
	return output.split("\n").map((line) => line.trim()).find(Boolean);
}

export function unique(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}
