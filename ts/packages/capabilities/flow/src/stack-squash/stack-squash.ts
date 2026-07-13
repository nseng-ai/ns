import {
	commandSucceeded,
	execApiToCommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
import type {
	GraphiteStackGateway,
	StackInfo,
	StackResult,
} from "@nseng-ai/capability-kit/graphite/stack";

const GIT_STATUS_TIMEOUT_MS = 60_000;
const GT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000;
const COMMIT_COUNT_TIMEOUT_MS = 60_000;

interface StackSquashCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export type StackSquashGraphiteGateway = Pick<GraphiteStackGateway, "stack">;

export interface StackSquashOptions {
	cwd: string;
	onProgress?: (message: string) => void;
	onPlan?: (plan: readonly StackSquashPlanEntry[]) => void;
	onBranchStarted?: (entry: StackSquashPlanEntry) => void;
	onBranchCompleted?: (entry: ProcessedStackBranch) => void;
	onRestoreStarted?: () => void;
	onRestoreCompleted?: () => void;
}

export interface StackSquashPlanEntry {
	branch: string;
	parent: string;
	commitsBefore: number;
}

export interface ProcessedStackBranch {
	branch: string;
	commitsBefore: number;
	state: "squashed" | "already_one_commit" | "no_commits";
}

export interface StackSquashOutcomePresentation {
	resultingCommits: 0 | 1;
	matrixUpdate: {
		state: "done" | "skipped";
		text: string;
	};
	summaryText: string;
}

export interface StackSquashCommandFailure {
	command: "git" | "gt";
	args: readonly string[];
	cwd: string;
	execResult: ExecResult;
}

export type StackSquashDiscoveryFailureReason =
	| "untracked-branch"
	| "provider-failure"
	| "ancestor-cycle"
	| "ancestor-row-missing"
	| "inconsistent-trunk-marker"
	| "inconsistent-ancestor-metadata";

export type StackSquashOutcome =
	| { kind: "success"; processed: readonly ProcessedStackBranch[] }
	| ({ kind: "worktree-probe-failed" } & StackSquashCommandFailure)
	| { kind: "worktree-dirty"; status: string; cwd: string }
	| {
			kind: "stack-discovery-failed";
			reason: StackSquashDiscoveryFailureReason;
			message: string;
			cwd: string;
	  }
	| { kind: "empty-stack"; cwd: string }
	| ({ kind: "commit-count-failed"; branch: string; parent: string } & StackSquashCommandFailure)
	| ({ kind: "checkout-failed"; branch: string } & StackSquashCommandFailure)
	| ({ kind: "squash-failed"; branch: string } & StackSquashCommandFailure)
	| ({ kind: "tip-restore-failed"; branch: string } & StackSquashCommandFailure);

export async function runStackSquashFlow(
	commands: StackSquashCommands,
	graphite: StackSquashGraphiteGateway,
	options: StackSquashOptions,
): Promise<StackSquashOutcome> {
	const statusArgs = ["status", "--porcelain=v1"];
	const status = await commands.exec("git", statusArgs, {
		cwd: options.cwd,
		timeout: GIT_STATUS_TIMEOUT_MS,
	});
	if (!commandSucceeded(status)) {
		return commandFailure("worktree-probe-failed", {
			command: "git",
			args: statusArgs,
			cwd: options.cwd,
			execResult: status,
		});
	}
	if (status.stdout.trim().length > 0) {
		return { kind: "worktree-dirty", status: status.stdout.trim(), cwd: options.cwd };
	}

	const stackDiscovery = discoverStackSquashPath(await graphite.stack(options.cwd));
	if (stackDiscovery.type === "failure") {
		return {
			kind: "stack-discovery-failed",
			reason: stackDiscovery.reason,
			message: stackDiscovery.message,
			cwd: options.cwd,
		};
	}
	const { branches, trunk } = stackDiscovery;
	if (branches.length === 0) return { kind: "empty-stack", cwd: options.cwd };

	const tipBranch = branches.at(-1);
	if (tipBranch === undefined) return { kind: "empty-stack", cwd: options.cwd };
	const plan: StackSquashPlanEntry[] = [];
	let parent = trunk;
	for (const branch of branches) {
		const countArgs = ["rev-list", "--count", `${parent}..${branch}`];
		const countResult = await commands.exec("git", countArgs, {
			cwd: options.cwd,
			timeout: COMMIT_COUNT_TIMEOUT_MS,
		});
		const commitsBefore = parseCommitCount(countResult);
		if (commitsBefore === undefined) {
			return {
				...commandFailure("commit-count-failed", {
					command: "git",
					args: countArgs,
					cwd: options.cwd,
					execResult: countResult,
				}),
				branch,
				parent,
			};
		}
		plan.push({ branch, parent, commitsBefore });
		parent = branch;
	}
	const planFromTip = [...plan].reverse();
	options.onPlan?.(planFromTip);
	const totalCommits = plan.reduce((sum, entry) => sum + entry.commitsBefore, 0);
	options.onProgress?.(
		`Preparing to squash ${branches.length} Graphite stack branch${branches.length === 1 ? "" : "es"} containing ${totalCommits} commit${totalCommits === 1 ? "" : "s"} from ${tipBranch}.`,
	);

	const processed: ProcessedStackBranch[] = [];
	function completeBranch(completed: ProcessedStackBranch): void {
		processed.push(completed);
		options.onBranchCompleted?.(completed);
	}

	for (const entry of planFromTip) {
		const { branch, commitsBefore } = entry;
		const nonSquashOutcome = stackSquashNonSquashOutcome(entry);
		if (nonSquashOutcome !== undefined) {
			completeBranch(nonSquashOutcome);
			continue;
		}
		options.onBranchStarted?.(entry);
		const checkoutArgs = ["checkout", branch, "--no-interactive"];
		const checkout = await runGt(commands, options.cwd, checkoutArgs);
		if (!commandSucceeded(checkout)) {
			return {
				...commandFailure("checkout-failed", {
					command: "gt",
					args: checkoutArgs,
					cwd: options.cwd,
					execResult: checkout,
				}),
				branch,
			};
		}

		options.onProgress?.(`Squashing ${branch}.`);
		const squashArgs = ["squash", "--no-edit", "--no-interactive"];
		const squash = await runGt(commands, options.cwd, squashArgs);
		if (!commandSucceeded(squash)) {
			if (
				squash.type === "exited" &&
				squash.signal === null &&
				isAlreadyOneCommitSquashResult(squash)
			) {
				completeBranch({ branch, commitsBefore, state: "already_one_commit" });
				continue;
			}
			return {
				...commandFailure("squash-failed", {
					command: "gt",
					args: squashArgs,
					cwd: options.cwd,
					execResult: squash,
				}),
				branch,
			};
		}
		completeBranch({ branch, commitsBefore, state: "squashed" });
	}

	options.onRestoreStarted?.();
	const restoreArgs = ["checkout", tipBranch, "--no-interactive"];
	const restore = await runGt(commands, options.cwd, restoreArgs);
	if (!commandSucceeded(restore)) {
		return {
			...commandFailure("tip-restore-failed", {
				command: "gt",
				args: restoreArgs,
				cwd: options.cwd,
				execResult: restore,
			}),
			branch: tipBranch,
		};
	}

	options.onRestoreCompleted?.();
	return { kind: "success", processed };
}

export function stackSquashCommandFailureDetail(
	outcome: Exclude<StackSquashOutcome, { kind: "success" }>,
): StackSquashCommandFailure | undefined {
	switch (outcome.kind) {
		case "worktree-probe-failed":
		case "commit-count-failed":
		case "checkout-failed":
		case "squash-failed":
		case "tip-restore-failed":
			return outcome;
		case "stack-discovery-failed":
		case "worktree-dirty":
		case "empty-stack":
			return undefined;
	}
}

export function describeStackSquashOutcome(
	outcome: Exclude<StackSquashOutcome, { kind: "success" }>,
): string {
	switch (outcome.kind) {
		case "worktree-probe-failed":
			return "Cannot inspect worktree state; stack squash did not run.";
		case "worktree-dirty":
			return "Worktree has uncommitted changes; stack squash did not run.";
		case "stack-discovery-failed":
			return outcome.message;
		case "empty-stack":
			return "No Graphite stack branches to squash.";
		case "commit-count-failed":
			return `Could not count commits for Graphite branch \`${outcome.branch}\` relative to \`${outcome.parent}\`; stack squash did not run.`;
		case "checkout-failed":
			return `Could not check out Graphite branch \`${outcome.branch}\`; stack squash stopped.`;
		case "squash-failed":
			return `Could not squash Graphite branch \`${outcome.branch}\`; stack squash stopped.`;
		case "tip-restore-failed":
			return `Could not restore Graphite tip branch \`${outcome.branch}\`.`;
	}
}

export function stackSquashNonSquashOutcome(
	entry: Pick<StackSquashPlanEntry, "branch" | "commitsBefore">,
): ProcessedStackBranch | undefined {
	const { branch, commitsBefore } = entry;
	if (commitsBefore === 0) return { branch, commitsBefore, state: "no_commits" };
	if (commitsBefore === 1) return { branch, commitsBefore, state: "already_one_commit" };
	return undefined;
}

export function formatStackSquashCellText(commitsBefore: number): string {
	return `${commitsBefore}→1`;
}

export function stackSquashOutcomePresentation(
	entry: ProcessedStackBranch,
): StackSquashOutcomePresentation {
	switch (entry.state) {
		case "no_commits":
			return {
				resultingCommits: 0,
				matrixUpdate: { state: "skipped", text: "empty" },
				summaryText: "0 commits (no squash needed)",
			};
		case "already_one_commit":
			return {
				resultingCommits: 1,
				matrixUpdate: { state: "skipped", text: "no-op" },
				summaryText: "1 commit (no squash needed)",
			};
		case "squashed":
			return {
				resultingCommits: 1,
				matrixUpdate: { state: "done", text: formatStackSquashCellText(entry.commitsBefore) },
				summaryText: `${entry.commitsBefore} → 1 commit`,
			};
	}
}

export function formatStackSquashSummary(processed: readonly ProcessedStackBranch[]): string {
	const presentations = processed.map((entry) => ({
		entry,
		presentation: stackSquashOutcomePresentation(entry),
	}));
	const commitsBefore = processed.reduce((sum, entry) => sum + entry.commitsBefore, 0);
	const resultingCommits = presentations.reduce(
		(sum, { presentation }) => sum + presentation.resultingCommits,
		0,
	);
	const commitsRemoved = commitsBefore - resultingCommits;
	return [
		`Processed ${processed.length} Graphite stack branch${processed.length === 1 ? "" : "es"}; ${commitsBefore} commit${commitsBefore === 1 ? "" : "s"} became ${resultingCommits} (${commitsRemoved} removed).`,
		"",
		...presentations.map(
			({ entry, presentation }) => `- ${entry.branch}: ${presentation.summaryText}`,
		),
	].join("\n");
}

type StackSquashPathDiscovery =
	| { type: "success"; trunk: string; branches: readonly string[] }
	| {
			type: "failure";
			reason: StackSquashDiscoveryFailureReason;
			message: string;
	  };

function discoverStackSquashPath(result: StackResult): StackSquashPathDiscovery {
	if (result.type === "untracked_branch") {
		return {
			type: "failure",
			reason: "untracked-branch",
			message: `${result.message} Stack squash did not run; track the branch with \`gt track\` first.`,
		};
	}
	if (result.type === "failure") {
		return {
			type: "failure",
			reason: "provider-failure",
			message: `Could not read Graphite stack metadata: ${result.failure.message}. Stack squash did not run.`,
		};
	}

	const { stack } = result;
	if (stack.ancestorTermination.type === "cycle") {
		return {
			type: "failure",
			reason: "ancestor-cycle",
			message: `Graphite ancestor metadata contains a cycle at \`${stack.ancestorTermination.branch}\`; stack squash did not run.`,
		};
	}
	if (stack.ancestorTermination.type === "row_missing") {
		return {
			type: "failure",
			reason: "ancestor-row-missing",
			message: `Graphite ancestor metadata is missing branch \`${stack.ancestorTermination.branch}\`; stack squash did not run.`,
		};
	}
	if (stack.trunkMarker.type === "problem") {
		return {
			type: "failure",
			reason: "inconsistent-trunk-marker",
			message: describeInconsistentTrunkMarker(stack),
		};
	}
	if (stack.current === stack.trunk) {
		return { type: "success", trunk: stack.trunk, branches: [] };
	}
	if (!hasConsistentAncestors(stack)) {
		return {
			type: "failure",
			reason: "inconsistent-ancestor-metadata",
			message: `Graphite ancestor metadata does not form a unique path from trunk \`${stack.trunk}\` to current branch \`${stack.current}\`; stack squash did not run.`,
		};
	}

	return {
		type: "success",
		trunk: stack.trunk,
		branches: [...stack.ancestors.filter((branch) => branch !== stack.trunk), stack.current],
	};
}

function hasConsistentAncestors(stack: StackInfo): boolean {
	const path = [...stack.ancestors, stack.current];
	return (
		stack.trunk.trim() !== "" &&
		stack.current.trim() !== "" &&
		stack.ancestors[0] === stack.trunk &&
		path.every((branch) => branch.trim() !== "") &&
		new Set(path).size === path.length
	);
}

function describeInconsistentTrunkMarker(stack: StackInfo): string {
	if (stack.trunkMarker.type === "clean") {
		throw new Error("Expected inconsistent Graphite trunk marker metadata.");
	}
	const markedTrunks =
		stack.trunkMarker.markedTrunks.length === 0
			? "none"
			: stack.trunkMarker.markedTrunks.map((branch) => `\`${branch}\``).join(", ");
	return `Graphite trunk metadata is inconsistent at \`${stack.trunkMarker.terminus}\` (${stack.trunkMarker.terminusState}); marked trunks: ${markedTrunks}. Stack squash did not run.`;
}

async function runGt(
	commands: StackSquashCommands,
	cwd: string,
	args: readonly string[],
): Promise<ExecResult> {
	return await runGraphiteCommand(execApiToCommandRunner(commands), {
		cwd,
		args,
		timeoutMs: GT_COMMAND_TIMEOUT_MS,
	});
}

function parseCommitCount(result: ExecResult): number | undefined {
	if (!commandSucceeded(result)) return undefined;
	const text = result.stdout.trim();
	if (text === "") return undefined;
	const value = Number(text);
	return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isAlreadyOneCommitSquashResult(result: ExecResult): boolean {
	return `${result.stdout}\n${result.stderr}`.includes(
		"Only one commit in branch, nothing to squash.",
	);
}

function commandFailure<Kind extends StackSquashOutcome["kind"]>(
	kind: Kind,
	failure: StackSquashCommandFailure,
): { kind: Kind } & StackSquashCommandFailure {
	return { kind, ...failure };
}
