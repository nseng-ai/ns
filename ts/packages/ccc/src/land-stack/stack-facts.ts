import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { formatCommand } from "@asdl/core/exec";
import { GIT_TIMEOUT_MS, GT_TIMEOUT_MS } from "./constants.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { completed, failure, landStackFailure, success, type LandStackOutcome, type LandStackResult } from "./errors.ts";
import {
	derivePathToTrunk,
	deriveDescendantSubtree,
	detectForkViolations,
	formatForkViolations,
	loadGraphiteTopology,
	resolveMetadataDbPath,
	type GraphiteTopology,
} from "./graphite-topology.ts";
import type { LandStackExtensionAPI, LandingShape, StackSnapshot } from "./types.ts";

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
				`Detached HEAD; check out a branch before running /code:land.\n${formatCommandDetails(result, formatCommand("git", ["symbolic-ref", "--short", "HEAD"]))}`,
			),
		);
	}
	const branch = result.stdout.trim();
	if (!branch) {
		return failure(landStackFailure("Could not resolve current branch before running /code:land."));
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

export async function loadLandingShape(pi: LandStackExtensionAPI, cwd: string): Promise<LandStackResult<LandingShape>> {
	const repoRoot = await loadRepoRoot(pi, cwd);
	if (repoRoot.type === "failure") return repoRoot;

	const current = await loadCurrentBranch(pi, repoRoot.value);
	if (current.type === "failure") return current;

	const trunk = await loadTrunk(pi, repoRoot.value);
	if (trunk.type === "failure") return trunk;

	const metadataDbPath = await resolveMetadataDbPath(pi, repoRoot.value);
	if (metadataDbPath.type === "failure") return metadataDbPath;

	const stack = await loadStackSnapshot({
		pi,
		repoRoot: repoRoot.value,
		metadataDbPath: metadataDbPath.value,
		current: current.value,
		trunk: trunk.value,
	});
	if (stack.type === "failure") return stack;

	return success({
		repoRoot: repoRoot.value,
		current: current.value,
		trunk: trunk.value,
		metadataDbPath: metadataDbPath.value,
		stack: stack.value,
	});
}

export interface LoadStackSnapshotOptions {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	metadataDbPath: string;
	current: string;
	trunk: string;
}

export async function loadStackSnapshot(options: LoadStackSnapshotOptions): Promise<LandStackResult<StackSnapshot>> {
	const { pi, repoRoot, metadataDbPath, current, trunk } = options;
	const topology = await loadGraphiteTopology(pi, repoRoot, metadataDbPath);
	if (topology.type === "failure") return topology;

	const landingBranches = derivePathToTrunk({ topology: topology.value, current, trunk, dbPath: metadataDbPath });
	if (landingBranches.type === "failure") return landingBranches;

	const violations = detectForkViolations(topology.value, landingBranches.value);
	if (violations.length > 0) {
		return failure(formatForkViolations(violations, trunk));
	}

	const descendantBranches = deriveDescendantSubtree(topology.value, current);
	if (descendantBranches.type === "failure") return descendantBranches;

	return success({
		trunk,
		current,
		actualCurrentBranch: current,
		landingTargetBranch: current,
		landingBranches: landingBranches.value,
		remainingLandingBranches: [],
		descendantBranches: descendantBranches.value,
		warnings: trunkMarkerWarnings(topology.value, trunk),
	});
}

function trunkMarkerWarnings(topology: GraphiteTopology, trunk: string): string[] {
	const marked = [...topology.entries()].filter(([, entry]) => entry.isTrunkMarked).map(([branch]) => branch);
	const warnings: string[] = [];
	if (marked.length > 1) {
		warnings.push(`multiple branches are marked as trunk in Graphite metadata: ${marked.join(", ")}`);
	}
	if (marked.length > 0 && !marked.includes(trunk)) {
		warnings.push(`Graphite metadata marks ${marked.join(", ")} as trunk, but gt trunk is ${trunk}; ${trunk} remains the required merge target`);
	}
	return warnings;
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

export interface DetectInProgressOperationOptions {
	pathExists?: ((path: string) => boolean) | undefined;
}

export async function detectInProgressOperation(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	options: DetectInProgressOperationOptions = {},
): Promise<string | undefined> {
	const pathExists = options.pathExists ?? defaultPathExists;
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
		if (gitPath && pathExists(resolveGitPath(repoRoot, gitPath))) {
			return "A rebase";
		}
	}

	return undefined;
}

function defaultPathExists(path: string): boolean {
	return existsSync(path);
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
