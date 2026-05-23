import { formatCommand } from "../command-runtime.ts";
import { exec } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import { fail } from "./errors.ts";
import { collectPrSubmitRequirements, loadPr, validateInitialPrPreflight } from "./pr-facts.ts";
import {
	assertCleanRepo,
	assertLocalBranchExists,
	loadCurrentBranch,
	loadLocalSha,
	loadRepoRoot,
	loadStackSnapshot,
	loadTrunk,
	unique,
} from "./stack-facts.ts";
import type { BranchPlan, ExtensionAPI, LandingPlan, RestackRequirement, StackSnapshot } from "./types.ts";
import { detectWorktreeConflicts, formatManualWorktreeConflict } from "./worktrees.ts";

export async function buildLandingPlan(
	pi: ExtensionAPI,
	cwd: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): Promise<LandingPlan> {
	const repoRoot = await loadRepoRoot(pi, cwd);
	const current = await loadCurrentBranch(pi, repoRoot);
	const trunk = await loadTrunk(pi, repoRoot);
	const stack = await loadStackSnapshot(pi, repoRoot, current, trunk);

	if (stack.current === stack.trunk || stack.landingBranches.length === 0) {
		fail(`Current branch is ${stack.current}, which is trunk or has no PR path to land. Nothing to do.`, { level: "info" });
	}

	await assertCleanRepo(pi, repoRoot);

	const relevantBranches = unique([...stack.landingBranches, ...stack.descendantBranches]);
	for (const branch of relevantBranches) {
		await assertLocalBranchExists(pi, repoRoot, branch);
	}

	const branchPlans: BranchPlan[] = [];
	for (const branch of stack.landingBranches) {
		const localSha = await loadLocalSha(pi, repoRoot, branch);
		const pr = await loadPr(pi, repoRoot, branch);
		branchPlans.push({ branch, localSha, pr });
	}
	validateInitialPrPreflight(branchPlans, stack.trunk, { allowSubmitRequiredState: Boolean(options.allowSubmitRequiredState) });
	const prSubmitRequirements = collectPrSubmitRequirements(branchPlans, stack.trunk);

	const conflicts = await detectWorktreeConflicts(pi, repoRoot, current, relevantBranches);
	const manualConflicts = conflicts.filter((conflict) => conflict.kind === "manual-worktree");
	if (manualConflicts.length > 0) {
		fail(formatManualWorktreeConflict(manualConflicts), {
			suggestedAction: "Detach those worktrees or check out unrelated branches, then rerun /land-stack.",
		});
	}

	const submitRestackRequirements =
		prSubmitRequirements.length > 0 ? await collectSubmitRestackRequirements(pi, repoRoot, stack) : [];

	return {
		repoRoot,
		stack,
		branchPlans,
		prSubmitRequirements,
		submitRestackRequirements,
		managedSlotConflicts: conflicts.filter((conflict) => conflict.kind === "managed-slot"),
	};
}

export async function collectSubmitRestackRequirements(
	pi: ExtensionAPI,
	repoRoot: string,
	stack: StackSnapshot,
): Promise<RestackRequirement[]> {
	const requirements: RestackRequirement[] = [];
	for (const edge of landingParentEdges(stack)) {
		const result = await exec(
			pi,
			"git",
			["rev-list", "-1", localBranchRef(edge.parent), "--not", localBranchRef(edge.branch)],
			repoRoot,
			GIT_TIMEOUT_MS,
		);
		if (result.code !== 0) {
			fail(`Could not inspect whether ${edge.branch} contains parent ${edge.parent}.`, {
				commandDisplay: formatCommand("git", ["rev-list", "-1", localBranchRef(edge.parent), "--not", localBranchRef(edge.branch)]),
				result,
			});
		}
		if (result.stdout.trim().length > 0) {
			requirements.push(edge);
		}
	}
	return requirements;
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
