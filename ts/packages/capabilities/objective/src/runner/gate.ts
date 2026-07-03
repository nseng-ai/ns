import type { GitCurrentBranchResult } from "@ji/capability-kit/git";
import { commandSucceeded, formatCommandDetails } from "@ji/core/exec";

import type { ObjectiveRunnerCoreContext, RunnerStepMode } from "./context.ts";
import type { RunnerReport } from "./report.ts";

export const GATE_CHECK_IDS = [
	"branch-not-trunk",
	"moved-off-base",
	"same-branch-as-attempt",
	"branch-matches-report",
	"graphite-tracked",
	"worktree-dirty",
	"head-unchanged",
	"index-clean",
	"diff-check",
] as const;
export type GateCheckId = (typeof GATE_CHECK_IDS)[number];

export const GATE_CHECK_STATUSES = ["passed", "failed", "skipped"] as const;
export type GateCheckStatus = (typeof GATE_CHECK_STATUSES)[number];

export interface GateCheckResult {
	id: GateCheckId;
	status: GateCheckStatus;
	detail?: string;
}

export type GateBranchUnavailableReason =
	| { type: "detached" }
	| { type: "failure"; message: string };

export interface GateOutcome {
	hasPassed: boolean;
	checks: readonly GateCheckResult[];
	/** Live branch at verification, or null when it could not be determined. */
	branch: string | null;
	branchUnavailableReason: GateBranchUnavailableReason | null;
	/** Live changed paths from the gate's own statusPaths call. */
	changedPaths: readonly string[];
}

export interface VerifyRunnerStepOptions {
	mode: RunnerStepMode;
	report: RunnerReport;
	baseBranch: string;
	headAtDispatch: string;
}

/**
 * Deterministic verification gate for a `ready-for-parent-commit` report.
 *
 * Runs every pre-candidate check and collects all failures so a failure
 * checkpoint carries the complete per-check picture; infrastructure errors
 * surface as failed checks with the error as detail. The mode-inapplicable
 * branch check is represented explicitly as skipped. When verification passes,
 * the gate leaves the exact runner commit candidate staged for commit. If the
 * cached diff check fails after staging, the gate makes a best-effort attempt to
 * unstage the candidate while preserving the worktree for recovery.
 */
export async function verifyRunnerStep(
	ctx: ObjectiveRunnerCoreContext,
	options: VerifyRunnerStepOptions,
): Promise<GateOutcome> {
	const { mode, report, baseBranch, headAtDispatch } = options;
	const checks: GateCheckResult[] = [];

	const currentBranch = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	const branch = currentBranch.type === "branch" ? currentBranch.branch : null;
	const branchUnavailableReason = branchUnavailableReasonFrom(currentBranch);
	const branchUnavailableDetail = formatBranchUnavailableDetail(branchUnavailableReason);

	checks.push(
		branchCheck("branch-not-trunk", branch, branchUnavailableDetail, (live) =>
			live === ctx.trunkBranch
				? `Current branch is trunk (${ctx.trunkBranch}); refusing to commit on trunk.`
				: null,
		),
	);
	if (mode === "default") {
		checks.push(
			branchCheck("moved-off-base", branch, branchUnavailableDetail, (live) =>
				live === baseBranch
					? `Still on the base branch ${JSON.stringify(baseBranch)}; the child must create its own implementation branch.`
					: null,
			),
			{ id: "same-branch-as-attempt", status: "skipped", detail: "recover-mode check" },
		);
	} else {
		checks.push(
			{ id: "moved-off-base", status: "skipped", detail: "default-mode check" },
			branchCheck("same-branch-as-attempt", branch, branchUnavailableDetail, (live) =>
				live === baseBranch
					? null
					: `Recover step ended on ${JSON.stringify(live)} but the failed attempt was on ${JSON.stringify(baseBranch)}.`,
			),
		);
	}
	checks.push(
		branchCheck("branch-matches-report", branch, branchUnavailableDetail, (live) =>
			live === report.branch
				? null
				: `Report claims branch ${JSON.stringify(report.branch)} but the live branch is ${JSON.stringify(live)}.`,
		),
	);

	checks.push(await graphiteTrackedCheck(ctx, branch, branchUnavailableDetail));

	const status = await ctx.git.statusPaths({ cwd: ctx.repoRoot });
	const changedPaths = status.ok ? status.value.changedPaths : [];
	if (!status.ok) {
		checks.push({
			id: "worktree-dirty",
			status: "failed",
			detail: `Could not read git status: ${status.error.message}`,
		});
	} else if (changedPaths.length === 0) {
		checks.push({
			id: "worktree-dirty",
			status: "failed",
			detail: "Worktree is clean; a slice that changed nothing is a failed slice.",
		});
	} else {
		checks.push({ id: "worktree-dirty", status: "passed" });
	}

	checks.push(await headUnchangedCheck(ctx, headAtDispatch));
	checks.push(await indexCleanCheck(ctx));

	if (checks.some((check) => check.status === "failed")) {
		checks.push({
			id: "diff-check",
			status: "skipped",
			detail: "pre-candidate check failed; not staging commit candidate.",
		});
	} else {
		checks.push(await stageCandidateAndDiffCheck(ctx, changedPaths));
	}

	return {
		hasPassed: checks.every((check) => check.status !== "failed"),
		checks,
		branch,
		branchUnavailableReason,
		changedPaths,
	};
}

function branchUnavailableReasonFrom(
	currentBranch: GitCurrentBranchResult,
): GateBranchUnavailableReason | null {
	if (currentBranch.type === "branch") return null;
	if (currentBranch.type === "detached") return { type: "detached" };
	return { type: "failure", message: currentBranch.error.message };
}

function formatBranchUnavailableDetail(reason: GateBranchUnavailableReason | null): string {
	if (reason?.type === "failure") {
		return `Could not determine current branch: ${reason.message}`;
	}
	return "HEAD is detached; the step must end on a named branch.";
}

function branchCheck(
	id: GateCheckId,
	branch: string | null,
	branchUnknownDetail: string,
	failureDetail: (liveBranch: string) => string | null,
): GateCheckResult {
	if (branch === null) return { id, status: "failed", detail: branchUnknownDetail };
	const detail = failureDetail(branch);
	if (detail !== null) return { id, status: "failed", detail };
	return { id, status: "passed" };
}

async function graphiteTrackedCheck(
	ctx: ObjectiveRunnerCoreContext,
	branch: string | null,
	branchUnknownDetail: string,
): Promise<GateCheckResult> {
	if (branch === null) {
		return { id: "graphite-tracked", status: "failed", detail: branchUnknownDetail };
	}
	const tracked = await ctx.graphite.checkBranchTracked({ cwd: ctx.repoRoot, branch });
	if (!tracked.ok) {
		return { id: "graphite-tracked", status: "failed", detail: tracked.error.message };
	}
	if (!tracked.tracked) {
		return { id: "graphite-tracked", status: "failed", detail: tracked.detail };
	}
	return { id: "graphite-tracked", status: "passed" };
}

async function indexCleanCheck(ctx: ObjectiveRunnerCoreContext): Promise<GateCheckResult> {
	const result = await ctx.commands.exec("git", ["diff", "--cached", "--quiet", "--exit-code"], {
		cwd: ctx.repoRoot,
	});
	if (commandSucceeded(result)) return { id: "index-clean", status: "passed" };
	if (result.code === 1 && !result.killed) {
		return {
			id: "index-clean",
			status: "failed",
			detail:
				"Index already has staged changes; unstage them before runner-finish because the runner owns staging.",
		};
	}
	return {
		id: "index-clean",
		status: "failed",
		detail: `git diff --cached --quiet --exit-code failed: ${formatCommandDetails(result)}`,
	};
}

async function stageCandidateAndDiffCheck(
	ctx: ObjectiveRunnerCoreContext,
	changedPaths: readonly string[],
): Promise<GateCheckResult> {
	const staged = await ctx.git.stagePaths({ cwd: ctx.repoRoot, paths: changedPaths });
	if (!staged.ok) {
		return {
			id: "diff-check",
			status: "failed",
			detail: `Could not stage runner commit candidate: ${staged.error.message}`,
		};
	}
	const result = await ctx.commands.exec("git", ["diff", "--cached", "--check"], {
		cwd: ctx.repoRoot,
	});
	if (commandSucceeded(result)) return { id: "diff-check", status: "passed" };
	const diffCheckDetail = `git diff --cached --check failed: ${formatCommandDetails(result)}`;
	const reset = await ctx.commands.exec("git", ["reset", "--"], { cwd: ctx.repoRoot });
	return {
		id: "diff-check",
		status: "failed",
		detail: commandSucceeded(reset)
			? diffCheckDetail
			: `${diffCheckDetail}\nBest-effort unstage failed: ${formatCommandDetails(reset)}`,
	};
}

async function headUnchangedCheck(
	ctx: ObjectiveRunnerCoreContext,
	headAtDispatch: string,
): Promise<GateCheckResult> {
	const head = await ctx.git.headCommit({ cwd: ctx.repoRoot });
	if (!head.ok) {
		return {
			id: "head-unchanged",
			status: "failed",
			detail: `Could not resolve HEAD: ${head.error.message}`,
		};
	}
	if (head.value !== headAtDispatch) {
		return {
			id: "head-unchanged",
			status: "failed",
			detail: `HEAD moved from ${headAtDispatch} to ${head.value}; the child must not commit — the commit is the runner's act.`,
		};
	}
	return { id: "head-unchanged", status: "passed" };
}
