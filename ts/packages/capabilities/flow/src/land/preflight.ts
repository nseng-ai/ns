import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { shortSha } from "../commit-display/index.ts";
import { landCompleted, landFailure, landSuccess, landOutcomeFailure } from "./results.ts";
import { formatManualWorktreeConflict } from "./worktree-paths.ts";

import type {
	BranchLandingPlan,
	DescendantMaintenancePlan,
	LandContext,
	LandOutcome,
	LandResult,
	LandingDomainFailure,
	LandingPlan,
	LandingShape,
	LandingWarning,
	LocalBranchTip,
	PrSubmitRequirement,
	PullRequestFacts,
	RestackRequirement,
	StackSnapshot,
	WorkingTreeStatus,
	WorktreeConflict,
	WorktreeEntry,
} from "./types.ts";

export interface BuildStackLandingPlanOptions {
	readonly shouldAllowSubmitRequiredState?: boolean;
	readonly landingBranchLimit?: number;
	readonly shape?: StackLandingShape;
}

export interface StackLandingShape extends LandingShape {
	readonly localBranches: readonly LocalBranchTip[];
}

export async function buildStackLandingPlan(
	context: LandContext,
	cwd: string,
	options: BuildStackLandingPlanOptions = {},
): Promise<LandResult<LandingPlan>> {
	const loadedShape =
		options.shape === undefined
			? await loadStackLandingShape(context, cwd)
			: landSuccess(options.shape);
	if (loadedShape.type === "failure") return loadedShape;
	const shape = loadedShape.value;

	const stack = scopeStackSnapshot(shape.stack, options.landingBranchLimit);
	if (stack.actualCurrentBranch === stack.trunk || stack.landingBranches.length === 0) {
		return landFailure(
			domainFailure({
				phase: "preflight",
				reason: "nothing-to-land",
				message: `Current branch is ${stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
			}),
		);
	}

	const cleanRepo = await assertCleanRepo(context, shape.repoRoot);
	if (cleanRepo.type === "failure") return cleanRepo;

	const localBranchShas = new Map(shape.localBranches.map((branch) => [branch.name, branch.sha]));
	const branchPlans = await loadBranchPlans(
		context,
		shape.repoRoot,
		stack.landingBranches,
		localBranchShas,
	);
	if (branchPlans.type === "failure") return branchPlans;

	const initialPreflight = validateInitialPrPreflight(branchPlans.value, stack.trunk, {
		shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
	});
	if (initialPreflight.type === "failure") return initialPreflight;
	const prSubmitRequirements = collectPrSubmitRequirements(branchPlans.value, stack.trunk);

	const landingConflicts = await detectWorktreeConflicts({
		context,
		repoRoot: shape.repoRoot,
		currentBranch: stack.actualCurrentBranch,
		relevantBranches: stack.landingBranches,
	});
	if (landingConflicts.type === "failure") return landingConflicts;
	const landingManualConflicts = landingConflicts.value.filter(
		(conflict) => conflict.type === "manual-worktree",
	);
	if (landingManualConflicts.length > 0) {
		return landFailure(
			domainFailure({
				phase: "preflight",
				reason: "manual-worktree-conflict",
				message: formatManualWorktreeConflict(landingManualConflicts),
				suggestedAction:
					"Detach those landing-branch worktrees or check out unrelated branches, then rerun land preflight.",
			}),
		);
	}

	const descendantBranches =
		stack.remainingLandingBranches.length > 0 ? [] : stack.descendantBranches;
	const descendantConflicts =
		descendantBranches.length === 0
			? landSuccess([])
			: await detectWorktreeConflicts({
					context,
					repoRoot: shape.repoRoot,
					currentBranch: stack.actualCurrentBranch,
					relevantBranches: descendantBranches,
				});
	if (descendantConflicts.type === "failure") return descendantConflicts;

	const submitRestackRequirements =
		prSubmitRequirements.length === 0
			? landSuccess([])
			: await collectSubmitRestackRequirements(context, shape.repoRoot, stack);
	if (submitRestackRequirements.type === "failure") return submitRestackRequirements;

	const preflightWarnings = [...stack.warnings];
	const descendantMaintenance = buildDescendantMaintenancePlan(
		descendantBranches,
		descendantConflicts.value,
		stack.descendantRootBranches,
	);
	return landSuccess({
		repoRoot: shape.repoRoot,
		metadataDbPath: shape.metadataDbPath,
		stack,
		branchPlans: branchPlans.value,
		preflight: {
			status: prSubmitRequirements.length > 0 ? "submit-required" : "ready",
			checkedBranches: stack.landingBranches,
			warnings: preflightWarnings,
			failures: [],
		},
		prSubmitRequirements,
		submitRestackRequirements: submitRestackRequirements.value,
		managedSlotConflicts: landingConflicts.value.filter(
			(conflict) => conflict.type === "managed-slot",
		),
		descendantMaintenance,
	});
}

export function scopeStackSnapshot(
	stack: StackSnapshot,
	landingBranchLimit?: number,
): StackSnapshot {
	const fullLandingBranches = stack.landingBranches;
	const boundedLandingBranches =
		landingBranchLimit === undefined || landingBranchLimit >= fullLandingBranches.length
			? fullLandingBranches
			: fullLandingBranches.slice(0, landingBranchLimit);
	const remainingLandingBranches =
		landingBranchLimit === undefined || landingBranchLimit >= fullLandingBranches.length
			? []
			: fullLandingBranches.slice(landingBranchLimit);
	const landingTargetBranch = boundedLandingBranches.at(-1) ?? stack.landingTargetBranch;
	return {
		...stack,
		current: stack.actualCurrentBranch,
		landingTargetBranch,
		landingBranches: boundedLandingBranches,
		remainingLandingBranches,
		descendantRootBranches: [...stack.descendantRootBranches],
		warnings: stack.warnings.map(copyWarning),
	};
}

export async function loadStackLandingShape(
	context: LandContext,
	cwd: string,
): Promise<LandResult<StackLandingShape>> {
	const repoRoot = await context.git.resolveRepoRoot({ cwd });
	if (repoRoot.type === "failure") return repoRoot;
	const current = await context.git.currentBranch({ repoRoot: repoRoot.value });
	if (current.type === "failure") return current;
	const trunk = await context.graphite.trunk({ repoRoot: repoRoot.value });
	if (trunk.type === "failure") return trunk;
	const metadataDbPath = await context.graphite.metadataDbPath({ repoRoot: repoRoot.value });
	if (metadataDbPath.type === "failure") return metadataDbPath;
	const branches = await context.git.listLocalBranches({ repoRoot: repoRoot.value });
	if (branches.type === "failure") return branches;
	const stack = await context.graphite.stackShape({
		repoRoot: repoRoot.value,
		metadataDbPath: metadataDbPath.value,
		current: current.value,
		trunk: trunk.value,
		liveLocalBranches: branches.value.map((branch) => branch.name),
	});
	if (stack.type === "failure") return stack;
	return landSuccess({
		repoRoot: repoRoot.value,
		current: current.value,
		trunk: trunk.value,
		metadataDbPath: metadataDbPath.value,
		stack: stack.value,
		localBranches: branches.value,
	});
}

async function assertCleanRepo(context: LandContext, repoRoot: string): Promise<LandOutcome> {
	const status = await context.git.workingTreeStatus({ repoRoot });
	if (status.type === "failure") return status;
	if (status.value.inProgressOperation !== undefined) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "operation-in-progress",
				message: `${operationInProgressLabel(status.value.inProgressOperation)} is in progress; refusing to start stack landing.`,
			}),
		);
	}
	if (!status.value.isClean) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "dirty-worktree",
				message: "Working tree is not clean; commit, stash, or discard changes before landing.",
			}),
		);
	}
	return landCompleted();
}

async function loadBranchPlans(
	context: LandContext,
	repoRoot: string,
	landingBranches: readonly string[],
	localBranchShas: ReadonlyMap<string, string>,
): Promise<LandResult<readonly BranchLandingPlan[]>> {
	if (context.github.pullRequestFactsByBranch !== undefined) {
		const prs = await context.github.pullRequestFactsByBranch({
			repoRoot,
			branches: landingBranches,
		});
		if (prs.type === "failure") return prs;
		return branchPlansFromPrMap(landingBranches, localBranchShas, prs.value);
	}

	const branchPlans: BranchLandingPlan[] = [];
	for (const branch of landingBranches) {
		const pr = await context.github.pullRequestFacts({ repoRoot, branchOrNumber: branch });
		if (pr.type === "failure") return pr;
		const branchPlan = branchPlanFromFacts(branch, localBranchShas, pr.value);
		if (branchPlan.type === "failure") return branchPlan;
		branchPlans.push(branchPlan.value);
	}
	return landSuccess(branchPlans);
}

function branchPlansFromPrMap(
	landingBranches: readonly string[],
	localBranchShas: ReadonlyMap<string, string>,
	prs: ReadonlyMap<string, PullRequestFacts>,
): LandResult<readonly BranchLandingPlan[]> {
	const branchPlans: BranchLandingPlan[] = [];
	for (const branch of landingBranches) {
		const pr = prs.get(branch);
		if (pr === undefined) {
			return landFailure({
				type: "boundary",
				phase: "preflight",
				source: "github",
				code: "pull_request_batch_missing_branch",
				message: `Batched GitHub PR facts did not include ${branch}.`,
			});
		}
		const branchPlan = branchPlanFromFacts(branch, localBranchShas, pr);
		if (branchPlan.type === "failure") return branchPlan;
		branchPlans.push(branchPlan.value);
	}
	return landSuccess(branchPlans);
}

function branchPlanFromFacts(
	branch: string,
	localBranchShas: ReadonlyMap<string, string>,
	pr: PullRequestFacts,
): LandResult<BranchLandingPlan> {
	const localSha = localBranchShas.get(branch);
	if (localSha === undefined) return missingLocalBranchFailure(branch);
	return landSuccess({ branch, localSha, pr });
}

function missingLocalBranchFailure(branch: string): LandResult<never> {
	return landFailure(missingLocalBranch(branch));
}

function missingLocalBranch(branch: string): LandingDomainFailure {
	return domainFailure({
		phase: "preflight",
		reason: "local-branch-missing",
		message: `Local branch ${branch} does not exist; refusing to start stack landing.`,
		failedBranch: branch,
	});
}

export function validateInitialPrPreflight(
	branchPlans: readonly BranchLandingPlan[],
	trunk: string,
	options: { readonly shouldAllowSubmitRequiredState?: boolean } = {},
): LandOutcome {
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (branchPlan === undefined) continue;
		const expectedBaseRefName = expectedBaseRefNameForBranchPlan(index, trunk);
		const mismatches = prExpectationMismatchesForBranchPlan(branchPlan, expectedBaseRefName);
		const basics = validateOpenPrBasicsFromMismatches(
			{
				branch: branchPlan.branch,
				localSha: branchPlan.localSha,
				pr: branchPlan.pr,
				allowHeadShaMismatch: Boolean(options.shouldAllowSubmitRequiredState),
			},
			mismatches,
		);
		if (basics.type === "failure") return basics;
		if (mismatches.hasExpectedBaseMismatch && !options.shouldAllowSubmitRequiredState) {
			return landOutcomeFailure(
				domainFailure({
					phase: "preflight",
					reason: "pull-request-base-mismatch",
					message: `Bottom PR #${branchPlan.pr.number} targets ${branchPlan.pr.baseRefName}, expected ${trunk}; restack/submit it first.`,
					failedBranch: branchPlan.branch,
					failedPrNumber: branchPlan.pr.number,
				}),
			);
		}
	}
	return landCompleted();
}

interface PrCheckSubject {
	readonly branch: string;
	readonly localSha: string;
	readonly pr: PullRequestFacts;
}

export function validateStrictMergeGate(
	input: PrCheckSubject & {
		readonly trunk: string;
	},
): LandOutcome {
	const mismatches = prExpectationMismatches({
		branch: input.branch,
		localSha: input.localSha,
		pr: input.pr,
		expectedBaseRefName: input.trunk,
	});
	const basics = validateOpenPrBasicsFromMismatches(input, mismatches);
	if (basics.type === "failure") return basics;
	if (mismatches.hasExpectedBaseMismatch) {
		return landOutcomeFailure(
			domainFailure({
				phase: "merge",
				reason: "pull-request-base-mismatch",
				message: `PR #${input.pr.number} targets ${input.pr.baseRefName}, expected ${input.trunk}; restack/submit it first.`,
				failedBranch: input.branch,
				failedPrNumber: input.pr.number,
				suggestedAction: `Run gt restack/submit for ${input.branch}, then rerun /ns:flow:land.`,
			}),
		);
	}
	return landCompleted();
}

export function validateOpenPrBasics(
	input: PrCheckSubject & {
		readonly allowHeadShaMismatch?: boolean;
	},
): LandOutcome {
	return validateOpenPrBasicsFromMismatches(input, prExpectationMismatches(input));
}

interface PrExpectationMismatches {
	readonly isNotOpen: boolean;
	readonly isDraft: boolean;
	readonly hasHeadBranchMismatch: boolean;
	readonly hasHeadShaMismatch: boolean;
	readonly hasExpectedBaseMismatch: boolean;
}

function prExpectationMismatches(
	input: PrCheckSubject & {
		readonly expectedBaseRefName?: string;
	},
): PrExpectationMismatches {
	return {
		isNotOpen: input.pr.state !== "OPEN",
		isDraft: input.pr.isDraft,
		hasHeadBranchMismatch: input.pr.headRefName !== input.branch,
		hasHeadShaMismatch: input.pr.headRefOid !== input.localSha,
		hasExpectedBaseMismatch:
			input.expectedBaseRefName !== undefined && input.pr.baseRefName !== input.expectedBaseRefName,
	};
}

function expectedBaseRefNameForBranchPlan(index: number, trunk: string): string | undefined {
	return index === 0 ? trunk : undefined;
}

function prExpectationMismatchesForBranchPlan(
	branchPlan: BranchLandingPlan,
	expectedBaseRefName: string | undefined,
): PrExpectationMismatches {
	return prExpectationMismatches({
		branch: branchPlan.branch,
		localSha: branchPlan.localSha,
		pr: branchPlan.pr,
		...optionalEntry("expectedBaseRefName", expectedBaseRefName),
	});
}

function validateOpenPrBasicsFromMismatches(
	input: PrCheckSubject & {
		readonly allowHeadShaMismatch?: boolean;
	},
	mismatches: PrExpectationMismatches,
): LandOutcome {
	const { branch, localSha, pr } = input;
	if (mismatches.isNotOpen) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-not-open",
				message: `PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (mismatches.isDraft) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-draft",
				message: `PR #${pr.number} for ${branch} is a draft; mark it ready before landing.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (mismatches.hasHeadBranchMismatch) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-head-mismatch",
				message: `PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (mismatches.hasHeadShaMismatch && !input.allowHeadShaMismatch) {
		return landOutcomeFailure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-head-mismatch",
				message: `PR #${pr.number} head SHA does not match local branch SHA; submit or update the branch first.\nPR head: ${shortSha(pr.headRefOid)}\nLocal ${branch}: ${shortSha(localSha)}`,
				failedBranch: branch,
				failedPrNumber: pr.number,
				suggestedAction: `Submit or update ${branch}, then rerun land preflight.`,
			}),
		);
	}
	return landCompleted();
}

export function collectPrSubmitRequirements(
	branchPlans: readonly BranchLandingPlan[],
	trunk: string,
): readonly PrSubmitRequirement[] {
	const requirements: PrSubmitRequirement[] = [];
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (branchPlan === undefined) continue;
		const expectedBaseRefName = expectedBaseRefNameForBranchPlan(index, trunk);
		const mismatches = prExpectationMismatchesForBranchPlan(branchPlan, expectedBaseRefName);
		const reasons: string[] = [];
		if (mismatches.hasHeadShaMismatch) {
			reasons.push(
				`head ${shortSha(branchPlan.pr.headRefOid)} != local ${shortSha(branchPlan.localSha)}`,
			);
		}
		if (mismatches.hasExpectedBaseMismatch) {
			reasons.push(`base ${branchPlan.pr.baseRefName} != ${expectedBaseRefName}`);
		}
		if (reasons.length > 0) {
			requirements.push({
				branch: branchPlan.branch,
				prNumber: branchPlan.pr.number,
				localSha: branchPlan.localSha,
				prHeadSha: branchPlan.pr.headRefOid,
				baseRefName: branchPlan.pr.baseRefName,
				...optionalEntry("expectedBaseRefName", expectedBaseRefName),
				reasons,
			});
		}
	}
	return requirements;
}

export interface DetectWorktreeConflictsOptions {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly currentBranch: string;
	readonly relevantBranches: readonly string[];
}

export async function detectWorktreeConflicts(
	options: DetectWorktreeConflictsOptions,
): Promise<LandResult<readonly WorktreeConflict[]>> {
	const worktrees = await options.context.worktrees.worktrees({ repoRoot: options.repoRoot });
	if (worktrees.type === "failure") return worktrees;
	const relevant = new Set(options.relevantBranches);
	const conflicts: WorktreeConflict[] = [];
	for (const worktree of worktrees.value) {
		if (worktree.branch === undefined || !relevant.has(worktree.branch)) continue;
		const conflict = await classifyConflict({ ...options, worktree });
		if (conflict.type === "failure") return conflict;
		conflicts.push(conflict.value);
	}
	return landSuccess(conflicts);
}

interface ClassifyConflictOptions {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly currentBranch: string;
	readonly worktree: WorktreeEntry;
}

async function classifyConflict(
	options: ClassifyConflictOptions,
): Promise<LandResult<WorktreeConflict>> {
	const { context, repoRoot, currentBranch, worktree } = options;
	if (worktree.branch === currentBranch && worktree.path === repoRoot) {
		return landSuccess({ type: "current", branch: worktree.branch, path: worktree.path });
	}
	const classification = await context.worktrees.classifyWorktree({
		repoRoot,
		path: worktree.path,
		...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
	});
	if (classification.type === "failure") return classification;
	if (classification.value.type === "managed-slot") {
		return landSuccess({
			type: "managed-slot",
			branch: worktree.branch ?? "",
			path: worktree.path,
			slotName: classification.value.slotName,
		});
	}
	if (classification.value.type === "current") {
		return landSuccess({ type: "current", branch: worktree.branch ?? "", path: worktree.path });
	}
	return landSuccess({
		type: "manual-worktree",
		branch: worktree.branch ?? "",
		path: worktree.path,
	});
}

export function buildDescendantMaintenancePlan(
	descendantBranches: readonly string[],
	conflicts: readonly WorktreeConflict[],
	descendantRootBranches: readonly string[],
): DescendantMaintenancePlan {
	if (descendantBranches.length === 0) return { type: "none", branches: [] };
	const targetBranches = [...descendantRootBranches];
	const blockingConflicts = conflicts.filter((conflict) => conflict.type !== "current");
	if (blockingConflicts.length > 0) {
		return {
			type: "skipped",
			branches: descendantBranches,
			targetBranches,
			conflicts: blockingConflicts,
			reason: "descendant branches are checked out elsewhere",
		};
	}
	return { type: "auto", branches: descendantBranches, targetBranches };
}

export async function collectSubmitRestackRequirements(
	context: LandContext,
	repoRoot: string,
	stack: StackSnapshot,
): Promise<LandResult<readonly RestackRequirement[]>> {
	const requirements: RestackRequirement[] = [];
	for (const edge of landingParentEdges(stack)) {
		const containsParent = await context.git.branchContainsParent({
			repoRoot,
			branch: edge.branch,
			parent: edge.parent,
		});
		if (containsParent.type === "failure") return containsParent;
		if (!containsParent.value) requirements.push(edge);
	}
	return landSuccess(requirements);
}

export function landingParentEdges(stack: StackSnapshot): readonly RestackRequirement[] {
	return stack.landingBranches.map((branch, index) => ({
		branch,
		parent: index === 0 ? stack.trunk : (stack.landingBranches[index - 1] ?? stack.trunk),
	}));
}

function operationInProgressLabel(
	operation: NonNullable<WorkingTreeStatus["inProgressOperation"]>,
): string {
	if (operation === "cherry-pick") return "A cherry-pick";
	if (operation === "bisect") return "A bisect";
	return `A ${operation}`;
}

function copyWarning(warning: LandingWarning): LandingWarning {
	return {
		level: warning.level,
		message: warning.message,
		...optionalEntry("commandDisplay", warning.commandDisplay),
		...optionalEntry("result", warning.result),
		...optionalEntry("suggestedAction", warning.suggestedAction),
		...optionalEntry("notificationAction", warning.notificationAction),
	};
}

function domainFailure(input: Omit<LandingDomainFailure, "type">): LandingDomainFailure {
	return { type: "domain", ...input };
}
