import type {
	BranchLandingPlan,
	DescendantMaintenancePlan,
	LandContext,
	LandOutcome,
	LandResult,
	LandingDomainFailure,
	LandingFailure,
	LandingOutcome,
	LandingPhaseOutcome,
	LandingPlan,
	LandingRequest,
	LandingShape,
	LandingWarning,
	PrSubmitRequirement,
	PullRequestFacts,
	RestackRequirement,
	StackSnapshot,
	WorktreeConflict,
	WorktreeEntry,
} from "./types.ts";

export interface BuildStackLandingPlanOptions {
	readonly shouldAllowSubmitRequiredState?: boolean;
	readonly preloadedShape?: LandingShape;
	readonly landingBranchLimit?: number;
}

export async function buildStackLandingPlan(
	context: LandContext,
	cwd: string,
	options: BuildStackLandingPlanOptions = {},
): Promise<LandResult<LandingPlan>> {
	const shape = options.preloadedShape
		? success(options.preloadedShape)
		: await loadLandingShape(context, cwd);
	if (shape.type === "failure") return shape;

	const stack = scopeStackSnapshot(shape.value.stack, options.landingBranchLimit);
	if (stack.actualCurrentBranch === stack.trunk || stack.landingBranches.length === 0) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "nothing-to-land",
				message: `Current branch is ${stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
			}),
		);
	}

	const cleanRepo = await assertCleanRepo(context, shape.value.repoRoot);
	if (cleanRepo.type === "failure") return cleanRepo;

	for (const branch of stack.landingBranches) {
		const branchExists = await context.git.localBranchExists({
			repoRoot: shape.value.repoRoot,
			branch,
		});
		if (branchExists.type === "failure") return branchExists;
	}

	const branchPlans = await loadBranchPlans(context, shape.value.repoRoot, stack.landingBranches);
	if (branchPlans.type === "failure") return branchPlans;

	const initialPreflight = validateInitialPrPreflight(branchPlans.value, stack.trunk, {
		shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
	});
	if (initialPreflight.type === "failure") return initialPreflight;
	const prSubmitRequirements = collectPrSubmitRequirements(branchPlans.value, stack.trunk);

	const landingConflicts = await detectWorktreeConflicts({
		context,
		repoRoot: shape.value.repoRoot,
		currentBranch: stack.actualCurrentBranch,
		relevantBranches: stack.landingBranches,
	});
	if (landingConflicts.type === "failure") return landingConflicts;
	const landingManualConflicts = landingConflicts.value.filter(
		(conflict) => conflict.type === "manual-worktree",
	);
	if (landingManualConflicts.length > 0) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "manual-worktree-conflict",
				message: formatManualWorktreeConflict(landingManualConflicts),
				suggestedAction:
					"Detach those landing-branch worktrees or check out unrelated branches, then rerun /sdl:flow:land.",
			}),
		);
	}

	const descendantBranches =
		stack.remainingLandingBranches.length > 0 ? [] : stack.descendantBranches;
	const descendantConflicts =
		descendantBranches.length === 0
			? success([])
			: await detectWorktreeConflicts({
					context,
					repoRoot: shape.value.repoRoot,
					currentBranch: stack.actualCurrentBranch,
					relevantBranches: descendantBranches,
				});
	if (descendantConflicts.type === "failure") return descendantConflicts;

	const submitRestackRequirements =
		prSubmitRequirements.length === 0
			? success([])
			: await collectSubmitRestackRequirements(context, shape.value.repoRoot, stack);
	if (submitRestackRequirements.type === "failure") return submitRestackRequirements;

	const preflightWarnings = [...stack.warnings];
	const descendantMaintenance = buildDescendantMaintenancePlan(
		descendantBranches,
		descendantConflicts.value,
	);
	return success({
		repoRoot: shape.value.repoRoot,
		metadataDbPath: shape.value.metadataDbPath,
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

export async function calculateLandingOutcome(
	context: LandContext,
	request: LandingRequest,
): Promise<LandResult<LandingOutcome>> {
	if (request.target.type !== "stack") {
		return failure({
			type: "not-implemented",
			phase: "preflight",
			message: "sdl-land preflight planning currently supports stack landing targets only.",
		});
	}

	const plan = await buildStackLandingPlan(context, request.cwd, {
		shouldAllowSubmitRequiredState: request.preflight.shouldAllowSubmitRequiredState,
		...(request.target.landingBranchLimit === undefined
			? {}
			: { landingBranchLimit: request.target.landingBranchLimit }),
	});
	if (plan.type === "failure") {
		return failure(plan.failure);
	}

	const phases: LandingPhaseOutcome[] = [
		{ type: "completed", phase: "repo-discovery" },
		{ type: "completed", phase: "stack-shape" },
		{ type: "completed", phase: "preflight" },
	];
	if (request.mode === "dry-run") {
		phases.push({ type: "completed", phase: "dry-run" });
	} else {
		phases.push({ type: "skipped", phase: "merge", reason: "merge execution remains in Flow" });
	}

	return success({
		repoRoot: plan.value.repoRoot,
		target: request.target,
		mode: request.mode,
		phases,
		plan: plan.value,
		landedChunks: [],
		cleanup: { retainedLocalBranches: [], freedSlots: [] },
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
		warnings: stack.warnings.map(copyWarning),
	};
}

async function loadLandingShape(
	context: LandContext,
	cwd: string,
): Promise<LandResult<LandingShape>> {
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
	return success({
		repoRoot: repoRoot.value,
		current: current.value,
		trunk: trunk.value,
		metadataDbPath: metadataDbPath.value,
		stack: stack.value,
	});
}

async function assertCleanRepo(context: LandContext, repoRoot: string): Promise<LandOutcome> {
	const status = await context.git.workingTreeStatus({ repoRoot });
	if (status.type === "failure") return status;
	if (status.value.inProgressOperation !== undefined) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "operation-in-progress",
				message: `Repository has an in-progress ${status.value.inProgressOperation}; finish or abort it before landing.`,
			}),
		);
	}
	if (!status.value.isClean) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "dirty-worktree",
				message: "Working tree is not clean; commit, stash, or discard changes before landing.",
			}),
		);
	}
	return { type: "completed" };
}

async function loadBranchPlans(
	context: LandContext,
	repoRoot: string,
	landingBranches: readonly string[],
): Promise<LandResult<readonly BranchLandingPlan[]>> {
	const branchPlans: BranchLandingPlan[] = [];
	for (const branch of landingBranches) {
		const localSha = await context.git.localBranchSha({ repoRoot, branch });
		if (localSha.type === "failure") return localSha;
		const pr = await context.github.pullRequestFacts({ repoRoot, branchOrNumber: branch });
		if (pr.type === "failure") return pr;
		branchPlans.push({ branch, localSha: localSha.value, pr: pr.value });
	}
	return success(branchPlans);
}

function validateInitialPrPreflight(
	branchPlans: readonly BranchLandingPlan[],
	trunk: string,
	options: { readonly shouldAllowSubmitRequiredState?: boolean } = {},
): LandOutcome {
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (branchPlan === undefined) continue;
		const basics = validateOpenPrBasics({
			branch: branchPlan.branch,
			localSha: branchPlan.localSha,
			pr: branchPlan.pr,
			allowHeadShaMismatch: Boolean(options.shouldAllowSubmitRequiredState),
		});
		if (basics.type === "failure") return basics;
		if (
			index === 0 &&
			branchPlan.pr.baseRefName !== trunk &&
			!options.shouldAllowSubmitRequiredState
		) {
			return failure(
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
	return { type: "completed" };
}

function validateOpenPrBasics(input: {
	readonly branch: string;
	readonly localSha: string;
	readonly pr: PullRequestFacts;
	readonly allowHeadShaMismatch?: boolean;
}): LandOutcome {
	const { branch, localSha, pr } = input;
	if (pr.state !== "OPEN") {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-not-open",
				message: `PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (pr.isDraft) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-draft",
				message: `PR #${pr.number} for ${branch} is a draft; mark it ready before landing.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (pr.headRefName !== branch) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-head-mismatch",
				message: `PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.`,
				failedBranch: branch,
				failedPrNumber: pr.number,
			}),
		);
	}
	if (pr.headRefOid !== localSha && !input.allowHeadShaMismatch) {
		return failure(
			domainFailure({
				phase: "preflight",
				reason: "pull-request-head-mismatch",
				message: `PR #${pr.number} head SHA does not match local branch SHA; run gt submit/update first.\nPR head: ${shortSha(pr.headRefOid)}\nLocal ${branch}: ${shortSha(localSha)}`,
				failedBranch: branch,
				failedPrNumber: pr.number,
				suggestedAction: `Run gt submit/update for ${branch}, then rerun /sdl:flow:land.`,
			}),
		);
	}
	return { type: "completed" };
}

export function collectPrSubmitRequirements(
	branchPlans: readonly BranchLandingPlan[],
	trunk: string,
): readonly PrSubmitRequirement[] {
	const requirements: PrSubmitRequirement[] = [];
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (branchPlan === undefined) continue;
		const expectedBaseRefName = index === 0 ? trunk : undefined;
		const reasons: string[] = [];
		if (branchPlan.pr.headRefOid !== branchPlan.localSha) {
			reasons.push(
				`head ${shortSha(branchPlan.pr.headRefOid)} != local ${shortSha(branchPlan.localSha)}`,
			);
		}
		if (expectedBaseRefName !== undefined && branchPlan.pr.baseRefName !== expectedBaseRefName) {
			reasons.push(`base ${branchPlan.pr.baseRefName} != ${expectedBaseRefName}`);
		}
		if (reasons.length > 0) {
			requirements.push({
				branch: branchPlan.branch,
				prNumber: branchPlan.pr.number,
				localSha: branchPlan.localSha,
				prHeadSha: branchPlan.pr.headRefOid,
				baseRefName: branchPlan.pr.baseRefName,
				...(expectedBaseRefName === undefined ? {} : { expectedBaseRefName }),
				reasons,
			});
		}
	}
	return requirements;
}

interface DetectWorktreeConflictsOptions {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly currentBranch: string;
	readonly relevantBranches: readonly string[];
}

async function detectWorktreeConflicts(
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
	return success(conflicts);
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
		return success({ type: "current", branch: worktree.branch, path: worktree.path });
	}
	const classification = await context.worktrees.classifyWorktree({
		repoRoot,
		path: worktree.path,
		...(worktree.branch === undefined ? {} : { branch: worktree.branch }),
	});
	if (classification.type === "failure") return classification;
	if (classification.value.type === "managed-slot") {
		return success({
			type: "managed-slot",
			branch: worktree.branch ?? "",
			path: worktree.path,
			slotName: classification.value.slotName,
		});
	}
	if (classification.value.type === "current") {
		return success({ type: "current", branch: worktree.branch ?? "", path: worktree.path });
	}
	return success({ type: "manual-worktree", branch: worktree.branch ?? "", path: worktree.path });
}

function buildDescendantMaintenancePlan(
	descendantBranches: readonly string[],
	conflicts: readonly WorktreeConflict[],
): DescendantMaintenancePlan {
	if (descendantBranches.length === 0) return { type: "none", branches: [] };
	const targetBranch = descendantBranches[0] ?? "";
	const blockingConflicts = conflicts.filter((conflict) => conflict.type !== "current");
	if (blockingConflicts.length > 0) {
		return {
			type: "skipped",
			branches: descendantBranches,
			targetBranch,
			conflicts: blockingConflicts,
			reason: "descendant branches are checked out elsewhere",
		};
	}
	return { type: "auto", branches: descendantBranches, targetBranch };
}

async function collectSubmitRestackRequirements(
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
	return success(requirements);
}

export function landingParentEdges(stack: StackSnapshot): readonly RestackRequirement[] {
	return stack.landingBranches.map((branch, index) => ({
		branch,
		parent: index === 0 ? stack.trunk : (stack.landingBranches[index - 1] ?? stack.trunk),
	}));
}

function formatManualWorktreeConflict(conflicts: readonly WorktreeConflict[]): string {
	if (conflicts.length === 1) {
		const conflict = conflicts[0];
		return `Branch ${conflict?.branch ?? "unknown"} is checked out in non-slot worktree ${conflict?.path ?? "unknown"}; detach it manually and rerun.`;
	}
	return [
		"Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:",
		...conflicts.map((conflict) => `- ${conflict.branch} ${conflict.path}`),
	].join("\n");
}

function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

function copyWarning(warning: LandingWarning): LandingWarning {
	return {
		level: warning.level,
		message: warning.message,
		...(warning.suggestedAction === undefined ? {} : { suggestedAction: warning.suggestedAction }),
	};
}

function success<T>(value: T): LandResult<T> {
	return { type: "success", value };
}

function failure(failureValue: LandingFailure): {
	readonly type: "failure";
	readonly failure: LandingFailure;
} {
	return { type: "failure", failure: failureValue };
}

function domainFailure(input: Omit<LandingDomainFailure, "type">): LandingDomainFailure {
	return { type: "domain", ...input };
}
