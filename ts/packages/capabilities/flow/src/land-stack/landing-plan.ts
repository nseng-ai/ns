import { formatCommand } from "@sdl/exec";
import { buildStackLandingPlan } from "sdl-land/api";
import type {
	LandContext,
	LandingFailure,
	LandOutcome,
	LandResult,
	WorkingTreeStatus,
	WorktreeClassification,
} from "sdl-land/api";
import { exec } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import { resolveMetadataDbPath } from "./graphite-topology.ts";
import {
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackResult,
} from "./errors.ts";
import { loadPr } from "./pr-facts.ts";
import {
	assertLocalBranchExists,
	detectInProgressOperation,
	loadCurrentBranch,
	loadLandingShape,
	loadLocalSha,
	loadLiveLocalBranches,
	loadRepoRoot,
	loadTrunk,
} from "./stack-facts.ts";
import type {
	LandStackExtensionAPI,
	LandingPlan,
	LandingShape,
	RestackRequirement,
	StackSnapshot,
} from "./types.ts";
import {
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	slotNameFromPath,
} from "./worktrees.ts";

export async function buildLandingPlan(
	pi: LandStackExtensionAPI,
	cwd: string,
	options: {
		allowSubmitRequiredState?: boolean;
		preloadedShape?: LandingShape;
		landingBranchLimit?: number;
	} = {},
): Promise<LandStackResult<LandingPlan>> {
	const shape = options.preloadedShape
		? success(options.preloadedShape)
		: await loadLandingShape(pi, cwd);
	if (shape.type === "failure") return shape;

	const landPlan = await buildStackLandingPlan(createLandContext(pi), cwd, {
		allowSubmitRequiredState: Boolean(options.allowSubmitRequiredState),
		preloadedShape: {
			repoRoot: shape.value.repoRoot,
			current: shape.value.current,
			trunk: shape.value.trunk,
			metadataDbPath: shape.value.metadataDbPath,
			stack: {
				...shape.value.stack,
				warnings: shape.value.stack.warnings.map((message) => ({ level: "warning", message })),
			},
		},
		...(options.landingBranchLimit === undefined
			? {}
			: { landingBranchLimit: options.landingBranchLimit }),
	});
	if (landPlan.type === "failure") return failure(toLandStackFailure(landPlan.failure));

	return success(toFlowLandingPlan(landPlan.value));
}

function createLandContext(pi: LandStackExtensionAPI): LandContext {
	return {
		git: {
			resolveRepoRoot: async ({ cwd }) => toLandResult(await loadRepoRoot(pi, cwd), "git"),
			currentBranch: async ({ repoRoot }) =>
				toLandResult(await loadCurrentBranch(pi, repoRoot), "git"),
			workingTreeStatus: async ({ repoRoot }) => loadWorkingTreeStatus(pi, repoRoot),
			localBranchExists: async ({ repoRoot, branch }) =>
				loadLocalBranchExists(pi, repoRoot, branch),
			localBranchSha: async ({ repoRoot, branch }) =>
				toLandResult(await loadLocalSha(pi, repoRoot, branch), "git"),
			listLocalBranches: async ({ repoRoot }) => loadLocalBranches(pi, repoRoot),
			branchContainsParent: async ({ repoRoot, branch, parent }) =>
				loadBranchContainsParent(pi, repoRoot, branch, parent),
		},
		graphite: {
			trunk: async ({ repoRoot }) => toLandResult(await loadTrunk(pi, repoRoot), "graphite"),
			metadataDbPath: async ({ repoRoot }) =>
				toLandResult(await resolveMetadataDbPath(pi, repoRoot), "graphite"),
			stackShape: async (request) => {
				const shape = await loadLandingShape(pi, request.repoRoot);
				if (shape.type === "failure") return toLandResult(shape, "graphite");
				return {
					type: "success",
					value: {
						...shape.value.stack,
						warnings: shape.value.stack.warnings.map((message) => ({ level: "warning", message })),
					},
				};
			},
			prepareSubmitUpdate: async () => ({ type: "completed" }),
			prepareRestackForSubmit: async () => ({ type: "completed" }),
		},
		github: {
			pullRequestFacts: async ({ repoRoot, branchOrNumber }) => {
				const pr = await loadPr(pi, repoRoot, branchOrNumber);
				if (pr.type === "failure") return toLandResult(pr, "github");
				return {
					type: "success",
					value: {
						number: pr.value.number,
						title: pr.value.title,
						body: pr.value.body,
						state: pr.value.state,
						isDraft: pr.value.isDraft,
						headRefName: pr.value.headRefName,
						baseRefName: pr.value.baseRefName,
						headRefOid: pr.value.headRefOid,
						...(pr.value.mergeStateStatus === undefined
							? {}
							: { mergeStateStatus: pr.value.mergeStateStatus }),
						...(pr.value.url === undefined ? {} : { url: pr.value.url }),
						...(pr.value.mergedAt === undefined ? {} : { mergedAt: pr.value.mergedAt }),
					},
				};
			},
		},
		worktrees: {
			worktrees: async ({ repoRoot }) =>
				toLandResult(await loadWorktrees(pi, repoRoot), "worktree"),
			classifyWorktree: async ({ repoRoot, path }) => classifyWorktree(repoRoot, path),
		},
	};
}

async function loadWorkingTreeStatus(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<WorkingTreeStatus>> {
	const status = await exec({
		pi,
		command: "git",
		args: ["status", "--porcelain=v1"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (status.code !== 0) {
		return landFailure("git", `Could not inspect working tree status.`);
	}
	if (status.stdout.trim().length > 0) {
		return { type: "success", value: { isClean: false } };
	}

	const operation = await detectInProgressOperation(pi, repoRoot);
	if (operation === undefined) return { type: "success", value: { isClean: true } };
	return {
		type: "success",
		value: { isClean: true, inProgressOperation: toLandOperation(operation) },
	};
}

async function loadLocalBranchExists(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandOutcome> {
	const result = await assertLocalBranchExists(pi, repoRoot, branch);
	if (result.type === "success") return { type: "completed" };
	return { type: "failure", failure: toLandFailure(result.failure, "git") };
}

async function loadLocalBranches(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<readonly { readonly name: string; readonly sha: string }[]>> {
	const branches = await loadLiveLocalBranches(pi, repoRoot);
	if (branches.type === "failure") return toLandResult(branches, "git");
	return {
		type: "success",
		value: [...branches.value].map((name) => ({ name, sha: "" })),
	};
}

async function loadBranchContainsParent(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
	parent: string,
): Promise<LandResult<boolean>> {
	const result = await collectSubmitRestackRequirements(pi, repoRoot, {
		trunk: parent,
		current: branch,
		actualCurrentBranch: branch,
		landingTargetBranch: branch,
		landingBranches: [branch],
		remainingLandingBranches: [],
		descendantBranches: [],
		warnings: [],
	});
	if (result.type === "failure") return toLandResult(result, "git");
	return { type: "success", value: result.value.length === 0 };
}

function classifyWorktree(
	repoRoot: string,
	path: string,
): Promise<LandResult<WorktreeClassification>> {
	const normalizedPath = normalizeExistingPath(path);
	const normalizedRepoRoot = normalizeExistingPath(repoRoot);
	if (normalizedPath === normalizedRepoRoot) {
		return Promise.resolve({ type: "success", value: { type: "current" } });
	}
	if (isManagedSlotPath(path)) {
		return Promise.resolve({
			type: "success",
			value: { type: "managed-slot", slotName: slotNameFromPath(path) ?? "slot" },
		});
	}
	return Promise.resolve({ type: "success", value: { type: "manual-worktree" } });
}

function toLandOperation(operation: string): "cherry-pick" | "merge" | "rebase" | "revert" {
	if (operation.includes("cherry-pick")) return "cherry-pick";
	if (operation.includes("revert")) return "revert";
	if (operation.includes("rebase")) return "rebase";
	return "merge";
}

function toLandResult<T>(result: LandStackResult<T>, source: LandingFailureSource): LandResult<T> {
	if (result.type === "success") return result;
	return { type: "failure", failure: toLandFailure(result.failure, source) };
}

function landFailure(source: LandingFailureSource, message: string): LandResult<never> {
	return {
		type: "failure",
		failure: {
			type: "boundary",
			phase: "preflight",
			source,
			code: "flow-adapter-failure",
			message,
		},
	};
}

function toLandFailure(
	flowFailure: LandStackFailure,
	source: LandingFailureSource,
): LandingFailure {
	return {
		type: "boundary",
		phase: "preflight",
		source,
		code: "flow-adapter-failure",
		message: flowFailure.message,
	};
}

type LandingFailureSource = "git" | "graphite" | "github" | "worktree" | "slot";

interface LandPlanForFlow {
	readonly repoRoot: string;
	readonly metadataDbPath: string;
	readonly stack: {
		readonly trunk: string;
		readonly current: string;
		readonly actualCurrentBranch: string;
		readonly landingTargetBranch: string;
		readonly landingBranches: readonly string[];
		readonly remainingLandingBranches: readonly string[];
		readonly descendantBranches: readonly string[];
		readonly warnings: readonly { readonly message: string }[];
	};
	readonly branchPlans: readonly {
		readonly branch: string;
		readonly localSha: string;
		readonly pr: {
			readonly number: number;
			readonly title: string;
			readonly body: string | null;
			readonly state: string;
			readonly isDraft: boolean;
			readonly headRefName: string;
			readonly baseRefName: string;
			readonly headRefOid: string;
			readonly mergeStateStatus?: string;
			readonly url?: string;
			readonly mergedAt?: string | null;
		};
	}[];
	readonly prSubmitRequirements: readonly {
		readonly branch: string;
		readonly prNumber: number;
		readonly localSha: string;
		readonly prHeadSha: string;
		readonly baseRefName: string;
		readonly expectedBaseRefName?: string;
		readonly reasons: readonly string[];
	}[];
	readonly submitRestackRequirements: readonly RestackRequirement[];
	readonly managedSlotConflicts: readonly {
		readonly type: "current" | "managed-slot" | "manual-worktree";
		readonly branch: string;
		readonly path: string;
	}[];
	readonly descendantMaintenance:
		| { readonly type: "none"; readonly branches: readonly [] }
		| { readonly type: "auto"; readonly branches: readonly string[]; readonly targetBranch: string }
		| {
				readonly type: "skipped";
				readonly branches: readonly string[];
				readonly targetBranch?: string;
				readonly conflicts: readonly {
					readonly type: "current" | "managed-slot" | "manual-worktree";
					readonly branch: string;
					readonly path: string;
				}[];
				readonly reason: string;
		  };
}

function toFlowLandingPlan(plan: LandPlanForFlow): LandingPlan {
	return {
		repoRoot: plan.repoRoot,
		metadataDbPath: plan.metadataDbPath,
		stack: {
			trunk: plan.stack.trunk,
			current: plan.stack.current,
			actualCurrentBranch: plan.stack.actualCurrentBranch,
			landingTargetBranch: plan.stack.landingTargetBranch,
			landingBranches: [...plan.stack.landingBranches],
			remainingLandingBranches: [...plan.stack.remainingLandingBranches],
			descendantBranches: [...plan.stack.descendantBranches],
			warnings: plan.stack.warnings.map((warning) => warning.message),
		},
		branchPlans: plan.branchPlans.map((branchPlan) => ({
			branch: branchPlan.branch,
			localSha: branchPlan.localSha,
			pr: {
				number: branchPlan.pr.number,
				title: branchPlan.pr.title,
				body: branchPlan.pr.body,
				state: branchPlan.pr.state,
				isDraft: branchPlan.pr.isDraft,
				headRefName: branchPlan.pr.headRefName,
				baseRefName: branchPlan.pr.baseRefName,
				headRefOid: branchPlan.pr.headRefOid,
				mergeStateStatus: branchPlan.pr.mergeStateStatus,
				url: branchPlan.pr.url,
				mergedAt: branchPlan.pr.mergedAt,
			},
		})),
		prSubmitRequirements: plan.prSubmitRequirements.map((requirement) => ({
			branch: requirement.branch,
			prNumber: requirement.prNumber,
			localSha: requirement.localSha,
			prHeadSha: requirement.prHeadSha,
			baseRefName: requirement.baseRefName,
			expectedBaseRefName: requirement.expectedBaseRefName,
			reasons: [...requirement.reasons],
		})),
		submitRestackRequirements: plan.submitRestackRequirements.map((requirement) => ({
			branch: requirement.branch,
			parent: requirement.parent,
		})),
		managedSlotConflicts: plan.managedSlotConflicts.map(toFlowConflict),
		descendantMaintenance: toFlowDescendantMaintenance(plan.descendantMaintenance),
	};
}

function toFlowConflict(conflict: {
	readonly type: "current" | "managed-slot" | "manual-worktree";
	readonly branch: string;
	readonly path: string;
}): { branch: string; path: string; kind: "current" | "managed-slot" | "manual-worktree" } {
	return { branch: conflict.branch, path: conflict.path, kind: conflict.type };
}

function toFlowDescendantMaintenance(
	plan: LandPlanForFlow["descendantMaintenance"],
): LandingPlan["descendantMaintenance"] {
	if (plan.type === "none") return { kind: "none", branches: [] };
	if (plan.type === "auto") {
		return { kind: "auto", branches: [...plan.branches], targetBranch: plan.targetBranch };
	}
	return {
		kind: "skipped",
		branches: [...plan.branches],
		targetBranch: plan.targetBranch,
		conflicts: plan.conflicts.map(toFlowConflict),
		reason: plan.reason,
	};
}

function toLandStackFailure(failureValue: LandingFailure): LandStackFailure {
	if (failureValue.type === "domain") {
		if (failureValue.reason === "nothing-to-land") {
			return landStackFailure(failureValue.message, { level: "info" });
		}
		if (failureValue.reason === "dirty-worktree") {
			return landStackFailure("Working tree is dirty; refusing to start stack landing.");
		}
		if (failureValue.reason === "operation-in-progress") {
			return landStackFailure(
				`${operationLabel(failureValue.message)} is in progress; refusing to start stack landing.`,
			);
		}
	}
	return landStackFailure(failureValue.message);
}

function operationLabel(message: string): string {
	if (message.includes("cherry-pick")) return "A cherry-pick";
	if (message.includes("revert")) return "A revert";
	if (message.includes("rebase")) return "A rebase";
	return "A merge";
}

export function scopeStackSnapshot(
	stack: StackSnapshot,
	landingBranchLimit?: number,
): StackSnapshot {
	const actualCurrentBranch = stack.actualCurrentBranch;
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
		current: actualCurrentBranch,
		actualCurrentBranch,
		landingTargetBranch,
		landingBranches: boundedLandingBranches,
		remainingLandingBranches,
	};
}

export async function collectSubmitRestackRequirements(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	stack: StackSnapshot,
): Promise<LandStackResult<RestackRequirement[]>> {
	const requirements: RestackRequirement[] = [];
	for (const edge of landingParentEdges(stack)) {
		const args = [
			"rev-list",
			"-1",
			localBranchRef(edge.parent),
			"--not",
			localBranchRef(edge.branch),
		];
		const result = await exec({
			pi,
			command: "git",
			args,
			cwd: repoRoot,
			timeoutMs: GIT_TIMEOUT_MS,
		});
		if (result.code !== 0) {
			return failure(
				landStackFailure(
					`Could not inspect whether ${edge.branch} contains parent ${edge.parent}.`,
					{
						commandDisplay: formatCommand("git", args),
						result,
					},
				),
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
	return [
		"submit",
		"--branch",
		branch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
	];
}

export function restackForSubmitArgs(branch: string): string[] {
	return ["restack", "--branch", branch, "--upstack", "--no-interactive"];
}

export function restackTargetForSubmit(plan: LandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}
