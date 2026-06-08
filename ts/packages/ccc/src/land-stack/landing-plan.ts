import { formatCommand } from "@asdl/pi-extension-runtime/command-runtime";
import { exec } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import { collectPrSubmitRequirements, loadPr, validateInitialPrPreflight } from "./pr-facts.ts";
import {
	assertCleanRepo,
	assertLocalBranchExists,
	loadCurrentBranch,
	loadLocalSha,
	loadRepoRoot,
	loadStackSnapshot,
	loadTrunk,
} from "./stack-facts.ts";
import type {
	BranchPlan,
	DescendantMaintenancePlan,
	LandStackExtensionAPI,
	LandingPlan,
	RestackRequirement,
	StackSnapshot,
	WorktreeConflict,
} from "./types.ts";
import { detectWorktreeConflicts, formatManualWorktreeConflict } from "./worktrees.ts";

export async function buildLandingPlan(
	pi: LandStackExtensionAPI,
	cwd: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): Promise<LandStackResult<LandingPlan>> {
	const repoRoot = await loadRepoRoot(pi, cwd);
	if (repoRoot.type === "failure") return repoRoot;

	const current = await loadCurrentBranch(pi, repoRoot.value);
	if (current.type === "failure") return current;

	const trunk = await loadTrunk(pi, repoRoot.value);
	if (trunk.type === "failure") return trunk;

	const stack = await loadStackSnapshot(pi, repoRoot.value, current.value, trunk.value);
	if (stack.type === "failure") return stack;

	if (stack.value.current === stack.value.trunk || stack.value.landingBranches.length === 0) {
		return failure(
			landStackFailure(`Current branch is ${stack.value.current}, which is trunk or has no PR path to land. Nothing to do.`, { level: "info" }),
		);
	}

	const cleanRepo = await assertCleanRepo(pi, repoRoot.value);
	if (cleanRepo.type === "failure") return cleanRepo;

	const landingBranches = stack.value.landingBranches;
	const descendantBranches = stack.value.descendantBranches;
	for (const branch of landingBranches) {
		const branchExists = await assertLocalBranchExists(pi, repoRoot.value, branch);
		if (branchExists.type === "failure") return branchExists;
	}

	const branchPlans: BranchPlan[] = [];
	for (const branch of stack.value.landingBranches) {
		const localSha = await loadLocalSha(pi, repoRoot.value, branch);
		if (localSha.type === "failure") return localSha;
		const pr = await loadPr(pi, repoRoot.value, branch);
		if (pr.type === "failure") return pr;
		branchPlans.push({ branch, localSha: localSha.value, pr: pr.value });
	}
	const preflight = validateInitialPrPreflight(branchPlans, stack.value.trunk, {
		allowSubmitRequiredState: Boolean(options.allowSubmitRequiredState),
	});
	if (preflight.type === "failure") return preflight;
	const prSubmitRequirements = collectPrSubmitRequirements(branchPlans, stack.value.trunk);

	const landingConflicts = await detectWorktreeConflicts(pi, repoRoot.value, current.value, landingBranches);
	if (landingConflicts.type === "failure") return landingConflicts;
	const landingManualConflicts = landingConflicts.value.filter((conflict) => conflict.kind === "manual-worktree");
	if (landingManualConflicts.length > 0) {
		return failure(
			landStackFailure(formatManualWorktreeConflict(landingManualConflicts), {
				suggestedAction: "Detach those landing-branch worktrees or check out unrelated branches, then rerun /code:land-stack.",
			}),
		);
	}

	const descendantConflicts =
		descendantBranches.length > 0 ? await detectWorktreeConflicts(pi, repoRoot.value, current.value, descendantBranches) : success([]);
	if (descendantConflicts.type === "failure") return descendantConflicts;
	const descendantMaintenance = buildDescendantMaintenancePlan(descendantBranches, descendantConflicts.value);

	const submitRestackRequirements =
		prSubmitRequirements.length > 0 ? await collectSubmitRestackRequirements(pi, repoRoot.value, stack.value) : success([]);
	if (submitRestackRequirements.type === "failure") return submitRestackRequirements;

	return success({
		repoRoot: repoRoot.value,
		stack: stack.value,
		branchPlans,
		prSubmitRequirements,
		submitRestackRequirements: submitRestackRequirements.value,
		managedSlotConflicts: landingConflicts.value.filter((conflict) => conflict.kind === "managed-slot"),
		descendantMaintenance,
	});
}

function buildDescendantMaintenancePlan(
	descendantBranches: string[],
	conflicts: WorktreeConflict[],
): DescendantMaintenancePlan {
	if (descendantBranches.length === 0) {
		return { kind: "none", branches: [] };
	}

	const targetBranch = descendantBranches[0] ?? "";
	const blockingConflicts = conflicts.filter((conflict) => conflict.kind !== "current");
	if (blockingConflicts.length > 0) {
		return {
			kind: "skipped",
			branches: descendantBranches,
			targetBranch,
			conflicts: blockingConflicts,
			reason: "descendant branches are checked out elsewhere",
		};
	}

	return { kind: "auto", branches: descendantBranches, targetBranch };
}

export async function collectSubmitRestackRequirements(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	stack: StackSnapshot,
): Promise<LandStackResult<RestackRequirement[]>> {
	const requirements: RestackRequirement[] = [];
	for (const edge of landingParentEdges(stack)) {
		const args = ["rev-list", "-1", localBranchRef(edge.parent), "--not", localBranchRef(edge.branch)];
		const result = await exec(pi, "git", args, repoRoot, GIT_TIMEOUT_MS);
		if (result.code !== 0) {
			return failure(
				landStackFailure(`Could not inspect whether ${edge.branch} contains parent ${edge.parent}.`, {
					commandDisplay: formatCommand("git", args),
					result,
				}),
			);
		}
		if (result.stdout.trim().length > 0) {
			requirements.push(edge);
		}
	}
	return success(requirements);
}

export function landingParentEdges(stack: StackSnapshot): RestackRequirement[] {
	return stack.landingBranches.map((branch, index) => ({
		branch,
		parent: index === 0 ? stack.trunk : (stack.landingBranches[index - 1] ?? stack.trunk),
	}));
}

export function localBranchRef(branch: string): string {
	return `refs/heads/${branch}`;
}

export function submitUpdateArgs(branch: string): string[] {
	return ["submit", "--branch", branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
}

export function restackForSubmitArgs(branch: string): string[] {
	return ["restack", "--branch", branch, "--upstack", "--no-interactive"];
}

export function restackTargetForSubmit(plan: LandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}
