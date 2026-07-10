import { formatCommand, piExecApiToCommandExecApi } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	detectGitOperationInProgressAt,
	RealGitGateway,
	type GitLocalBranchTip,
	type GitOperationInProgress,
	type GitWorktreeStateFs,
	type GitWorktreeStateOptions,
} from "@nseng-ai/capability-kit/git";
import { reconcileTopologyToLiveBranches } from "@nseng-ai/capability-kit/graphite/metadata";
import { GIT_TIMEOUT_MS, GT_TIMEOUT_MS } from "./constants.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import {
	createLandGraphiteCommandChannel,
	formatGraphiteOperation,
	trunkOperation,
	untrackLocalBranchOperation,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import {
	derivePathToTrunk,
	deriveDescendantSubtree,
	detectForkViolations,
	formatForkViolations,
	loadGraphiteTopology,
	type GraphiteTopology,
} from "./graphite-topology.ts";
import { landingWarning, type LandingWarning, type StackSnapshot } from "../types.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export async function loadRepoRoot(
	pi: LandStackExtensionAPI,
	cwd: string,
): Promise<LandStackResult<string>> {
	const result = await exec({
		pi,
		command: "git",
		args: ["rev-parse", "--show-toplevel"],
		cwd,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Not inside a git repository.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--show-toplevel"]))}`,
			),
		);
	}
	const root = result.stdout.trim();
	if (!root) {
		return failure(landStackFailure("git rev-parse --show-toplevel returned no repository root."));
	}
	return success(root);
}

export async function loadCurrentBranch(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandStackResult<string>> {
	const result = await exec({
		pi,
		command: "git",
		args: ["symbolic-ref", "--short", "HEAD"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Detached HEAD; check out a branch before running /ns:flow:land.\n${formatCommandDetails(result, formatCommand("git", ["symbolic-ref", "--short", "HEAD"]))}`,
			),
		);
	}
	const branch = result.stdout.trim();
	if (!branch) {
		return failure(
			landStackFailure("Could not resolve current branch before running /ns:flow:land."),
		);
	}
	return success(branch);
}

export async function loadTrunk(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	graphite: LandGraphiteCommandChannel = createLandGraphiteCommandChannel({ pi }),
): Promise<LandStackResult<string>> {
	const operation = trunkOperation();
	const result = await graphite.run({
		operation,
		cwd: repoRoot,
		timeoutMs: GT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not resolve Graphite trunk.\n${formatCommandDetails(result, formatGraphiteOperation(operation))}`,
			),
		);
	}
	const trunk = firstNonEmptyLine(result.stdout);
	if (!trunk) {
		return failure(landStackFailure("gt trunk --no-interactive returned no branch."));
	}
	return success(trunk);
}

export interface LoadStackSnapshotOptions {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	metadataDbPath: string;
	current: string;
	trunk: string;
	liveLocalBranches?: readonly string[];
}

export async function loadStackSnapshot(
	options: LoadStackSnapshotOptions,
): Promise<LandStackResult<StackSnapshot>> {
	const { pi, repoRoot, metadataDbPath, current, trunk } = options;
	const topology = await loadGraphiteTopology(pi, repoRoot, metadataDbPath);
	if (topology.type === "failure") return topology;

	// Graphite's own plumbing silently drops metadata rows/children whose local
	// refs no longer exist; reconcile once here so the ancestor walk, fork gate,
	// and descendant subtree all operate on the gt-equivalent (live-ref) view.
	const liveBranches = await loadLiveLocalBranchNames({
		pi,
		repoRoot,
		...(options.liveLocalBranches === undefined
			? {}
			: { liveLocalBranches: options.liveLocalBranches }),
	});
	if (liveBranches.type === "failure") return liveBranches;
	const { topology: reconciled, droppedBranches } = reconcileTopologyToLiveBranches(
		topology.value,
		liveBranches.value,
	);

	const landingBranches = derivePathToTrunk({
		topology: reconciled,
		current,
		trunk,
		dbPath: metadataDbPath,
	});
	if (landingBranches.type === "failure") return landingBranches;

	const violations = detectForkViolations(reconciled, landingBranches.value);
	if (violations.length > 0) {
		return failure(formatForkViolations(violations, trunk));
	}

	const descendantBranches = deriveDescendantSubtree(reconciled, current);
	if (descendantBranches.type === "failure") return descendantBranches;
	const descendantRootBranches = [...(reconciled.get(current)?.children ?? [])];

	return success({
		trunk,
		current,
		actualCurrentBranch: current,
		landingTargetBranch: current,
		landingBranches: landingBranches.value,
		remainingLandingBranches: [],
		descendantBranches: descendantBranches.value,
		descendantRootBranches,
		warnings: [
			...trunkMarkerWarnings(reconciled, trunk),
			...staleMetadataBranchWarnings(droppedBranches),
		],
	});
}

export async function loadLiveLocalBranchTips(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandStackResult<readonly GitLocalBranchTip[]>> {
	const git = new RealGitGateway(piExecApiToCommandExecApi(pi));
	const tips = await git.listLocalBranchTips({ cwd: repoRoot });
	if (!tips.ok) {
		return failure(
			landStackFailure(
				`Could not enumerate local branches to reconcile Graphite metadata.\n${tips.error.message}`,
			),
		);
	}
	return success(tips.value);
}

export async function loadLiveLocalBranches(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandStackResult<ReadonlySet<string>>> {
	const tips = await loadLiveLocalBranchTips(pi, repoRoot);
	if (tips.type === "failure") return tips;
	return success(new Set(tips.value.map((tip) => tip.name)));
}

function loadLiveLocalBranchNames(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly liveLocalBranches?: readonly string[];
}): Promise<LandStackResult<ReadonlySet<string>>> {
	if (options.liveLocalBranches !== undefined) {
		return Promise.resolve(success(new Set(options.liveLocalBranches)));
	}
	return loadLiveLocalBranches(options.pi, options.repoRoot);
}

// A dangling child (a metadata row/child pointer for a branch deleted in git but
// never `gt untrack`ed) is stale state, not a broken stack: land proceeds and
// surfaces a single non-fatal warning so the user can clean it up.
function staleMetadataBranchWarnings(droppedBranches: readonly string[]): LandingWarning[] {
	if (droppedBranches.length === 0) return [];
	const cleanup = droppedBranches
		.map((branch) => formatGraphiteOperation(untrackLocalBranchOperation(branch)))
		.join("\n");
	return [
		landingWarning({
			message: `Ignored ${droppedBranches.length} stale Graphite metadata branch(es) with no local ref: ${droppedBranches.join(", ")}. Run:\n${cleanup}`,
		}),
	];
}

function trunkMarkerWarnings(topology: GraphiteTopology, trunk: string): LandingWarning[] {
	const marked = [...topology.entries()]
		.filter(([, entry]) => entry.isTrunkMarked)
		.map(([branch]) => branch);
	const warnings: LandingWarning[] = [];
	if (marked.length > 1) {
		warnings.push(
			landingWarning({
				message: `multiple branches are marked as trunk in Graphite metadata: ${marked.join(", ")}`,
			}),
		);
	}
	if (marked.length > 0 && !marked.includes(trunk)) {
		warnings.push(
			landingWarning({
				message: `Graphite metadata marks ${marked.join(", ")} as trunk, but gt trunk is ${trunk}; ${trunk} remains the required merge target`,
			}),
		);
	}
	return warnings;
}

export type InProgressGitOperation = GitOperationInProgress;

export async function assertCleanRepo(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	options: { gitStateFs?: GitWorktreeStateFs } = {},
): Promise<LandStackOutcome> {
	const status = await exec({
		pi,
		command: "git",
		args: ["status", "--porcelain=v1"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (status.code !== 0) {
		return failure(
			landStackFailure(
				`Could not inspect working tree status.\n${formatCommandDetails(status, formatCommand("git", ["status", "--porcelain=v1"]))}`,
			),
		);
	}
	if (status.stdout.trim().length > 0) {
		return failure(landStackFailure("Working tree is dirty; refusing to start stack landing."));
	}

	const operation = detectInProgressOperation(repoRoot, optionalEntry("fs", options.gitStateFs));
	if (operation) {
		return failure(
			landStackFailure(
				`${formatInProgressOperationLabel(operation)} is in progress; refusing to start stack landing.`,
			),
		);
	}
	return completed();
}

export function detectInProgressOperation(
	repoRoot: string,
	options: GitWorktreeStateOptions = {},
): InProgressGitOperation | undefined {
	// REBASE_HEAD can be left behind as a stale pseudo-ref after Git reports a clean, normal worktree.
	// The kit detector treats only Git's active rebase state directories as authoritative for rebase.
	return detectGitOperationInProgressAt(repoRoot, options)?.operation;
}

export function formatInProgressOperationLabel(operation: InProgressGitOperation): string {
	if (operation === "cherry-pick") return "A cherry-pick";
	if (operation === "bisect") return "A bisect";
	return `A ${operation}`;
}

export async function assertLocalBranchExists(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandStackOutcome> {
	const result = await exec({
		pi,
		command: "git",
		args: ["show-ref", "--verify", `refs/heads/${branch}`],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Local branch ${branch} does not exist; refusing to start stack landing.\n${formatCommandDetails(result)}`,
			),
		);
	}
	return completed();
}

export async function loadLocalSha(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandStackResult<string>> {
	const ref = `refs/heads/${branch}^{commit}`;
	const result = await exec({
		pi,
		command: "git",
		args: ["rev-parse", "--verify", ref],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not resolve local branch ${branch}.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--verify", ref]))}`,
			),
		);
	}
	const sha = result.stdout.trim();
	if (!sha) {
		return failure(landStackFailure(`git rev-parse returned no SHA for ${branch}.`));
	}
	return success(sha);
}
