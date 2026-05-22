import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandExecutionError, formatCommand, runCommand, type ExecFunction } from "./command.ts";
import { deriveHandoffKey, deriveLedgerKey, type BranchMemoryKey } from "./keys.ts";
import { formatSliceLedger, parseSliceLedgerMarkdown } from "./ledger.ts";
import type { StackRunPlanResult } from "./stack-run.ts";

const COMMAND_TIMEOUT_MS = 30_000;

export type StackRunOrchestrationDependencies = {
	cwd: string;
	exec: ExecFunction;
	writeTempFile?: ((content: string) => Promise<string>) | undefined;
	signal?: AbortSignal | undefined;
};

export type SliceLocator = BranchMemoryKey & {
	branch: string;
};

export type StackSliceStartResult =
	| {
			status: "complete";
			message: string;
		}
	| {
			status: "started";
			objective: string;
			plannedBranch: string;
			intendedParent: string;
			ledgerLocator: SliceLocator;
			handoffLocator: SliceLocator;
			previousHandoffLocator?: SliceLocator;
			kickoffPrompt: string;
		};

async function defaultWriteTempFile(content: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "asdl-stack-run-"));
	const path = join(directory, "ledger.md");
	await writeFile(path, content, "utf8");
	return path;
}

async function brmemCheck(
	deps: StackRunOrchestrationDependencies,
	locator: SliceLocator,
): Promise<boolean> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["check", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
			acceptedCodes: [0, 1],
		},
	);
	return result.code === 0;
}

function deriveHandoffLocator(objective: string, branch: string): SliceLocator {
	return { ...deriveHandoffKey(objective, branch), branch };
}

function deriveLedgerLocator(objective: string, branch: string): SliceLocator {
	return { ...deriveLedgerKey(objective, branch), branch };
}

async function firstIncompleteSlice(
	planResult: StackRunPlanResult,
	deps: StackRunOrchestrationDependencies,
): Promise<
	| {
			plannedBranch: string;
			index: number;
			intendedParent: string;
			handoffLocator: SliceLocator;
			previousHandoffLocator?: SliceLocator;
		}
	| undefined
> {
	for (const [index, plannedBranch] of planResult.plan.plannedBranches.entries()) {
		const handoffLocator = deriveHandoffLocator(planResult.plan.objective, plannedBranch);
		if (await brmemCheck(deps, handoffLocator)) {
			continue;
		}

		const intendedParent = index === 0 ? planResult.planBranch : planResult.plan.plannedBranches[index - 1]!;
		if (index === 0) {
			return { plannedBranch, index, intendedParent, handoffLocator };
		}

		return {
			plannedBranch,
			index,
			intendedParent,
			handoffLocator,
			previousHandoffLocator: deriveHandoffLocator(
				planResult.plan.objective,
				planResult.plan.plannedBranches[index - 1]!,
			),
		};
	}
	return undefined;
}

async function ensureCleanWorktree(deps: StackRunOrchestrationDependencies): Promise<void> {
	const result = await runCommand(deps.exec, "git", ["status", "--porcelain"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (result.stdout.trim().length > 0) {
		throw new Error(
			`Cannot start stack slice with a dirty worktree. Commit, amend, or clean these changes first:\n${result.stdout.trimEnd()}`,
		);
	}
}

async function currentBranch(deps: StackRunOrchestrationDependencies): Promise<string> {
	const result = await runCommand(deps.exec, "git", ["branch", "--show-current"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	return result.stdout.trim();
}

async function localBranchExists(
	deps: StackRunOrchestrationDependencies,
	branch: string,
): Promise<boolean> {
	const result = await runCommand(deps.exec, "git", ["rev-parse", "--verify", `refs/heads/${branch}`], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
		acceptedCodes: [0, 1],
	});
	return result.code === 0;
}

async function checkoutNewBranch(
	deps: StackRunOrchestrationDependencies,
	plannedBranch: string,
	intendedParent: string,
): Promise<void> {
	await runCommand(deps.exec, "git", ["checkout", "-b", plannedBranch, intendedParent], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
}

async function checkoutExistingBranch(
	deps: StackRunOrchestrationDependencies,
	plannedBranch: string,
	currentBranchName: string,
): Promise<void> {
	if (currentBranchName === plannedBranch) {
		return;
	}
	await runCommand(deps.exec, "git", ["checkout", plannedBranch], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
}

async function trackWithGraphite(
	deps: StackRunOrchestrationDependencies,
	intendedParent: string,
): Promise<void> {
	const args = ["track", "-p", intendedParent];
	const result = await deps.exec("gt", args, {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (!result.killed && result.code === 0) {
		return;
	}

	const combined = `${result.stdout}\n${result.stderr}`;
	if (/already tracked/i.test(combined) && combined.includes(intendedParent)) {
		return;
	}

	throw new CommandExecutionError(formatCommand("gt", args), result);
}

async function writeSliceLedger(
	planResult: StackRunPlanResult,
	plannedBranch: string,
	deps: StackRunOrchestrationDependencies,
): Promise<SliceLocator> {
	const ledgerLocator = deriveLedgerLocator(planResult.plan.objective, plannedBranch);
	const ledgerContent = formatSliceLedger({
		planBranch: planResult.planBranch,
		planKey: planResult.locator.key,
		planSha256: planResult.plan.sha256,
	});
	const writeTempFile = deps.writeTempFile ?? defaultWriteTempFile;
	const ledgerPath = await writeTempFile(ledgerContent);
	await runCommand(
		deps.exec,
		"brmem",
		[
			"put",
			ledgerLocator.key,
			"--namespace",
			ledgerLocator.namespace,
			"--branch",
			ledgerLocator.branch,
			"--file",
			ledgerPath,
		],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return ledgerLocator;
}

async function brmemGet(
	deps: StackRunOrchestrationDependencies,
	locator: SliceLocator,
): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["get", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return result.stdout;
}

async function readAndValidateSliceLedger(
	planResult: StackRunPlanResult,
	plannedBranch: string,
	deps: StackRunOrchestrationDependencies,
): Promise<SliceLocator | undefined> {
	const ledgerLocator = deriveLedgerLocator(planResult.plan.objective, plannedBranch);
	if (!(await brmemCheck(deps, ledgerLocator))) {
		return undefined;
	}

	const ledger = parseSliceLedgerMarkdown(await brmemGet(deps, ledgerLocator));
	if (ledger.plan.branch !== planResult.planBranch) {
		throw new Error(
			`Slice ledger ${ledgerLocator.namespace}/${ledgerLocator.key} points at plan branch ${ledger.plan.branch}, expected ${planResult.planBranch}.`,
		);
	}
	if (ledger.plan.namespace !== planResult.locator.namespace || ledger.plan.key !== planResult.locator.key) {
		throw new Error(
			`Slice ledger ${ledgerLocator.namespace}/${ledgerLocator.key} points at ${ledger.plan.namespace}/${ledger.plan.key}, expected ${planResult.locator.namespace}/${planResult.locator.key}.`,
		);
	}
	if (ledger.plan.sha256 !== planResult.plan.sha256) {
		throw new Error(
			`Plan hash drift detected for ${planResult.locator.namespace}/${planResult.locator.key} on ${planResult.planBranch}: ledger has ${ledger.plan.sha256}, current content has ${planResult.plan.sha256}.`,
		);
	}
	return ledgerLocator;
}

async function preparePlannedBranchAndLedger(
	planResult: StackRunPlanResult,
	plannedBranch: string,
	intendedParent: string,
	deps: StackRunOrchestrationDependencies,
): Promise<SliceLocator> {
	const exists = await localBranchExists(deps, plannedBranch);
	if (!exists) {
		await checkoutNewBranch(deps, plannedBranch, intendedParent);
		await trackWithGraphite(deps, intendedParent);
		return writeSliceLedger(planResult, plannedBranch, deps);
	}

	const existingLedger = await readAndValidateSliceLedger(planResult, plannedBranch, deps);
	const branch = await currentBranch(deps);
	if (branch !== plannedBranch && !existingLedger) {
		throw new Error(
			`Planned branch ${plannedBranch} already exists but has no valid stack-runs ledger. Run /stack-status for diagnostics before resuming it.`,
		);
	}

	await checkoutExistingBranch(deps, plannedBranch, branch);
	await trackWithGraphite(deps, intendedParent);
	return existingLedger ?? writeSliceLedger(planResult, plannedBranch, deps);
}

export function buildKickoffPrompt(args: {
	objective: string;
	plannedBranch: string;
	intendedParent: string;
	planLocator: SliceLocator;
	planSha256: string;
	ledgerLocator: SliceLocator;
	handoffLocator: SliceLocator;
	previousHandoffLocator?: SliceLocator;
}): string {
	const previousHandoff = args.previousHandoffLocator
		? `${args.previousHandoffLocator.namespace}/${args.previousHandoffLocator.key} on branch ${args.previousHandoffLocator.branch}`
		: "none; this is the first planned branch.";

	return `Continue the ASDL stack-run Objective slice in this fresh session.

Objective slug: ${args.objective}
Objective path: .asdl/objectives/${args.objective}/

Canonical Branch Memory plan:
- Branch: ${args.planLocator.branch}
- Namespace: ${args.planLocator.namespace}
- Key: ${args.planLocator.key}
- SHA-256: ${args.planSha256}

Current planned branch: ${args.plannedBranch}
Intended parent branch: ${args.intendedParent}
Slice ledger: ${args.ledgerLocator.namespace}/${args.ledgerLocator.key} on branch ${args.ledgerLocator.branch}
Expected completion handoff: ${args.handoffLocator.namespace}/${args.handoffLocator.key} on branch ${args.handoffLocator.branch}
Previous handoff locator: ${previousHandoff}

Instructions:
1. Read the Branch Memory plan and the Objective before editing code.
2. Implement only the current branch's slice from the plan body.
3. Update the Objective with landed-state semantics for this slice.
4. Validate the slice and create/amend the Graphite commit.
5. When complete, call stack_slice_done with a concise handoff draft.
6. If blocked, call stack_slice_blocked with the reason, attempted work, and next steps.
`;
}

export async function startNextStackSlice(
	planResult: StackRunPlanResult,
	deps: StackRunOrchestrationDependencies,
): Promise<StackSliceStartResult> {
	const nextSlice = await firstIncompleteSlice(planResult, deps);
	if (!nextSlice) {
		return {
			status: "complete",
			message: `All planned branches for ${planResult.plan.objective} already have completion handoffs.`,
		};
	}

	await ensureCleanWorktree(deps);
	const ledgerLocator = await preparePlannedBranchAndLedger(
		planResult,
		nextSlice.plannedBranch,
		nextSlice.intendedParent,
		deps,
	);
	const planLocator = { ...planResult.locator };
	const kickoffArgs = {
		objective: planResult.plan.objective,
		plannedBranch: nextSlice.plannedBranch,
		intendedParent: nextSlice.intendedParent,
		planLocator,
		planSha256: planResult.plan.sha256,
		ledgerLocator,
		handoffLocator: nextSlice.handoffLocator,
	};
	const kickoffPrompt = buildKickoffPrompt(
		nextSlice.previousHandoffLocator
			? { ...kickoffArgs, previousHandoffLocator: nextSlice.previousHandoffLocator }
			: kickoffArgs,
	);

	const started = {
		status: "started" as const,
		objective: planResult.plan.objective,
		plannedBranch: nextSlice.plannedBranch,
		intendedParent: nextSlice.intendedParent,
		ledgerLocator,
		handoffLocator: nextSlice.handoffLocator,
		kickoffPrompt,
	};
	return nextSlice.previousHandoffLocator
		? { ...started, previousHandoffLocator: nextSlice.previousHandoffLocator }
		: started;
}
