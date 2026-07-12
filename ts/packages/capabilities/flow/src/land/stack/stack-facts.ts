import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	detectGitOperationInProgressAt,
	RealGitGateway,
	type GitLocalBranchTip,
	type GitOperationInProgress,
	type GitWorktreeStateFs,
	type GitWorktreeStateOptions,
} from "@nseng-ai/foundation/git";
import { reconcileTopologyToLiveBranches } from "@nseng-ai/capability-kit/graphite/metadata";
import { GIT_TIMEOUT_MS, GT_TIMEOUT_MS } from "./constants.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import {
	formatGraphiteOperation,
	trunkOperation,
	untrackLocalBranchOperation,
} from "../graphite-operations.ts";
import {
	createLandGraphiteCommandChannel,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import {
	landCompleted,
	landFailure,
	landOutcomeFailure,
	landingExecutionFailure,
	landSuccess,
	type LandOutcome,
	type LandResult,
} from "../results.ts";
import {
	derivePathToTrunk,
	deriveDescendantSubtree,
	detectForkViolations,
	formatForkViolations,
	loadGraphiteTopology,
	type GraphiteTopology,
} from "./graphite-topology.ts";
import { landingWarning, type LandingWarning, type StackSnapshot } from "../types.ts";
import { operationInProgressLabel } from "../working-tree-operations.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export async function loadRepoRoot(
	pi: LandStackExtensionAPI,
	cwd: string,
): Promise<LandResult<string>> {
	const result = await exec({
		pi,
		command: "git",
		args: ["rev-parse", "--show-toplevel"],
		cwd,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Not inside a git repository.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--show-toplevel"]))}`,
			),
		);
	}
	const root = result.stdout.trim();
	if (!root) {
		return landFailure(
			landingExecutionFailure("git rev-parse --show-toplevel returned no repository root."),
		);
	}
	return landSuccess(root);
}

export async function loadCurrentBranch(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<string>> {
	const result = await exec({
		pi,
		command: "git",
		args: ["symbolic-ref", "--short", "HEAD"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Detached HEAD; check out a branch before running /ns:flow:land.\n${formatCommandDetails(result, formatCommand("git", ["symbolic-ref", "--short", "HEAD"]))}`,
			),
		);
	}
	const branch = result.stdout.trim();
	if (!branch) {
		return landFailure(
			landingExecutionFailure("Could not resolve current branch before running /ns:flow:land."),
		);
	}
	return landSuccess(branch);
}

export async function loadTrunk(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	graphite: LandGraphiteCommandChannel = createLandGraphiteCommandChannel({ pi }),
): Promise<LandResult<string>> {
	const operation = trunkOperation();
	const result = await graphite.run({
		operation,
		cwd: repoRoot,
		timeoutMs: GT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Could not resolve Graphite trunk.\n${formatCommandDetails(result, formatGraphiteOperation(operation))}`,
			),
		);
	}
	const trunk = firstNonEmptyLine(result.stdout);
	if (!trunk) {
		return landFailure(landingExecutionFailure("gt trunk --no-interactive returned no branch."));
	}
	return landSuccess(trunk);
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
): Promise<LandResult<StackSnapshot>> {
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
		return landFailure(formatForkViolations(violations, trunk));
	}

	const descendantBranches = deriveDescendantSubtree(reconciled, current);
	if (descendantBranches.type === "failure") return descendantBranches;
	const descendantRootBranches = [...(reconciled.get(current)?.children ?? [])];

	return landSuccess({
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
): Promise<LandResult<readonly GitLocalBranchTip[]>> {
	const git = new RealGitGateway(pi);
	const tips = await git.listLocalBranchTips({ cwd: repoRoot });
	if (!tips.ok) {
		return landFailure(
			landingExecutionFailure(
				`Could not enumerate local branches to reconcile Graphite metadata.\n${tips.error.message}`,
			),
		);
	}
	return landSuccess(tips.value);
}

export async function loadLiveLocalBranches(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<ReadonlySet<string>>> {
	const tips = await loadLiveLocalBranchTips(pi, repoRoot);
	if (tips.type === "failure") return tips;
	return landSuccess(new Set(tips.value.map((tip) => tip.name)));
}

function loadLiveLocalBranchNames(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly liveLocalBranches?: readonly string[];
}): Promise<LandResult<ReadonlySet<string>>> {
	if (options.liveLocalBranches !== undefined) {
		return Promise.resolve(landSuccess(new Set(options.liveLocalBranches)));
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
): Promise<LandOutcome> {
	const status = await exec({
		pi,
		command: "git",
		args: ["status", "--porcelain=v1"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(status)) {
		return landOutcomeFailure(
			landingExecutionFailure(
				`Could not inspect working tree status.\n${formatCommandDetails(status, formatCommand("git", ["status", "--porcelain=v1"]))}`,
			),
		);
	}
	if (status.stdout.trim().length > 0) {
		return landOutcomeFailure(
			landingExecutionFailure("Working tree is dirty; refusing to start stack landing."),
		);
	}

	const operation = detectInProgressOperation(repoRoot, optionalEntry("fs", options.gitStateFs));
	if (operation) {
		return landOutcomeFailure(
			landingExecutionFailure(
				`${operationInProgressLabel(operation)} is in progress; refusing to start stack landing.`,
			),
		);
	}
	return landCompleted();
}

export function detectInProgressOperation(
	repoRoot: string,
	options: GitWorktreeStateOptions = {},
): InProgressGitOperation | undefined {
	// REBASE_HEAD can be left behind as a stale pseudo-ref after Git reports a clean, normal worktree.
	// The kit detector treats only Git's active rebase state directories as authoritative for rebase.
	return detectGitOperationInProgressAt(repoRoot, options)?.operation;
}

export async function assertLocalBranchExists(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandOutcome> {
	const result = await exec({
		pi,
		command: "git",
		args: ["show-ref", "--verify", `refs/heads/${branch}`],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landOutcomeFailure(
			landingExecutionFailure(
				`Local branch ${branch} does not exist; refusing to start stack landing.\n${formatCommandDetails(result)}`,
			),
		);
	}
	return landCompleted();
}

export async function loadLocalSha(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandResult<string>> {
	const ref = `refs/heads/${branch}^{commit}`;
	const result = await exec({
		pi,
		command: "git",
		args: ["rev-parse", "--verify", ref],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Could not resolve local branch ${branch}.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--verify", ref]))}`,
			),
		);
	}
	const sha = result.stdout.trim();
	if (!sha) {
		return landFailure(landingExecutionFailure(`git rev-parse returned no SHA for ${branch}.`));
	}
	return landSuccess(sha);
}
