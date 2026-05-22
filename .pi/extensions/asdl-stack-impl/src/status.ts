import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { runCommand, type ExecFunction } from "./command.ts";
import {
	deriveHandoffKey,
	deriveLedgerKey,
	derivePlanKey,
	escapeBranchForKey,
	STACK_PLANS_NAMESPACE,
	type BranchMemoryKey,
} from "./keys.ts";
import { parseSliceLedgerMarkdown } from "./ledger.ts";
import { parseStackPlanMarkdown, type StackPlanDocument } from "./plan.ts";
import { parseStackImplArgs, type StackImplFileSystem } from "./stack-impl.ts";

const COMMAND_TIMEOUT_MS = 30_000;

export type StatusDependencies = {
	cwd: string;
	exec: ExecFunction;
	fileSystem?: StackImplFileSystem;
	signal?: AbortSignal | undefined;
};

export type StatusPlan = {
	planBranch: string;
	locator: BranchMemoryKey & { branch: string };
	plan: StackPlanDocument;
	source: "local-file" | "branch-memory" | "current-ledger";
};

export type BranchStatus = {
	branch: string;
	intendedParent: string;
	gitBranchExists: boolean;
	ledgerPresent: boolean;
	handoffPresent: boolean;
	complete: boolean;
	warnings: string[];
};

export type StackStatusReport = {
	plan: StatusPlan;
	dirtyWorktree: boolean;
	branches: BranchStatus[];
	firstIncomplete?: string;
	warnings: string[];
};

const nodeFileSystem: StackImplFileSystem = {
	async isFile(path: string): Promise<boolean> {
		try {
			return (await stat(path)).isFile();
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return false;
			}
			throw error;
		}
	},
	readTextFile(path: string): Promise<string> {
		return readFile(path, "utf8");
	},
};

async function currentGitBranch(deps: StatusDependencies): Promise<string> {
	const result = await runCommand(deps.exec, "git", ["branch", "--show-current"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	const branch = result.stdout.trim();
	if (branch.length === 0) {
		throw new Error("Cannot resolve stack status from a detached HEAD; current git branch is empty.");
	}
	return branch;
}

async function brmemCheck(
	deps: StatusDependencies,
	locator: BranchMemoryKey & { branch: string },
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

async function brmemGet(
	deps: StatusDependencies,
	locator: BranchMemoryKey & { branch: string },
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

function parseBrmemListKeys(stdout: string): string[] {
	const parsed = JSON.parse(stdout) as { data?: { entries?: Array<{ key?: unknown }> } };
	const entries = parsed.data?.entries;
	if (!Array.isArray(entries)) {
		throw new Error("Invalid brmem list JSON: expected data.entries array.");
	}
	return entries.map((entry, index) => {
		if (typeof entry.key !== "string") {
			throw new Error(`Invalid brmem list entry at index ${index}: expected key string.`);
		}
		return entry.key;
	});
}

async function findCurrentBranchLedgerKey(branch: string, deps: StatusDependencies): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["list", "--namespace", "stack-impls", "--branch", branch, "--format", "json"],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	const suffix = `/${escapeBranchForKey(branch)}.md`;
	const keys = parseBrmemListKeys(result.stdout).filter((key) => key.endsWith(suffix));
	if (keys.length === 0) {
		throw new Error("Usage: /stack-impl-status <local-plan-file-or-branch-memory-key> (or run from a branch with a stack-impls ledger).",
		);
	}
	if (keys.length > 1) {
		throw new Error(`Multiple stack-impls ledgers match ${branch}: ${keys.join(", ")}.`);
	}
	return keys[0]!;
}

async function loadPlanFromCurrentLedger(branch: string, deps: StatusDependencies): Promise<StatusPlan> {
	const ledgerKey = await findCurrentBranchLedgerKey(branch, deps);
	const ledgerContent = await brmemGet(deps, { namespace: "stack-impls", key: ledgerKey, branch });
	const ledger = parseSliceLedgerMarkdown(ledgerContent);
	const locator = { namespace: ledger.plan.namespace, key: ledger.plan.key, branch: ledger.plan.branch };
	const plan = parseStackPlanMarkdown(await brmemGet(deps, locator));
	if (plan.sha256 !== ledger.plan.sha256) {
		throw new Error(
			`Plan hash drift detected for ${locator.namespace}/${locator.key} on ${locator.branch}: ledger has ${ledger.plan.sha256}, current content has ${plan.sha256}.`,
		);
	}
	return { source: "current-ledger", planBranch: locator.branch, locator, plan };
}

export async function loadPlanForStatus(args: string, deps: StatusDependencies): Promise<StatusPlan> {
	const fileSystem = deps.fileSystem ?? nodeFileSystem;
	const branch = await currentGitBranch(deps);
	if (args.trim().length === 0) {
		return loadPlanFromCurrentLedger(branch, deps);
	}

	const parsedArgs = parseStackImplArgs(args);
	const localPath = resolve(deps.cwd, parsedArgs.planArg);
	if (await fileSystem.isFile(localPath)) {
		const plan = parseStackPlanMarkdown(await fileSystem.readTextFile(localPath));
		return {
			source: "local-file",
			planBranch: branch,
			locator: { ...derivePlanKey(plan.objective), branch },
			plan,
		};
	}

	const locator = { namespace: STACK_PLANS_NAMESPACE, key: parsedArgs.planArg, branch };
	const plan = parseStackPlanMarkdown(await brmemGet(deps, locator));
	return { source: "branch-memory", planBranch: branch, locator, plan };
}

async function gitBranchExists(branch: string, deps: StatusDependencies): Promise<boolean> {
	const result = await runCommand(deps.exec, "git", ["rev-parse", "--verify", `refs/heads/${branch}`], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
		acceptedCodes: [0, 1],
	});
	return result.code === 0;
}

async function gitWorktreeDirty(deps: StatusDependencies): Promise<boolean> {
	const result = await runCommand(deps.exec, "git", ["status", "--porcelain"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	return result.stdout.trim().length > 0;
}

async function graphiteParent(branch: string, deps: StatusDependencies): Promise<string | undefined> {
	const result = await deps.exec("gt", ["branch", "info", branch], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (result.killed || result.code !== 0) {
		return undefined;
	}
	const match = result.stdout.match(/^Parent:\s+(.+)$/m);
	return match?.[1]?.trim();
}

async function branchStatus(
	statusPlan: StatusPlan,
	branch: string,
	index: number,
	deps: StatusDependencies,
): Promise<BranchStatus> {
	const intendedParent = index === 0 ? statusPlan.planBranch : statusPlan.plan.plannedBranches[index - 1]!;
	const warnings: string[] = [];
	const exists = await gitBranchExists(branch, deps);
	if (!exists) {
		warnings.push("missing git branch");
	}

	const ledgerLocator = { ...deriveLedgerKey(statusPlan.plan.objective, branch), branch };
	const ledgerPresent = await brmemCheck(deps, ledgerLocator);
	if (!ledgerPresent) {
		warnings.push("missing stack-impls ledger");
	} else {
		try {
			const ledger = parseSliceLedgerMarkdown(await brmemGet(deps, ledgerLocator));
			if (ledger.plan.branch !== statusPlan.planBranch || ledger.plan.key !== statusPlan.locator.key) {
				warnings.push("ledger points at a different plan locator");
			}
			if (ledger.plan.sha256 !== statusPlan.plan.sha256) {
				warnings.push("plan hash drift");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			warnings.push(`invalid ledger: ${message}`);
		}
	}

	const handoffLocator = { ...deriveHandoffKey(statusPlan.plan.objective, branch), branch };
	const handoffPresent = await brmemCheck(deps, handoffLocator);
	if (!handoffPresent) {
		warnings.push("missing completion handoff");
	}

	if (exists) {
		const parent = await graphiteParent(branch, deps);
		if (!parent) {
			warnings.push("Graphite tracking unavailable");
		} else if (parent !== intendedParent) {
			warnings.push(`Graphite parent mismatch: expected ${intendedParent}, got ${parent}`);
		}
	}

	return {
		branch,
		intendedParent,
		gitBranchExists: exists,
		ledgerPresent,
		handoffPresent,
		complete: handoffPresent,
		warnings,
	};
}

export async function buildStackStatusReport(
	args: string,
	deps: StatusDependencies,
): Promise<StackStatusReport> {
	const plan = await loadPlanForStatus(args, deps);
	const dirtyWorktree = await gitWorktreeDirty(deps);
	const branches: BranchStatus[] = [];
	for (const [index, branch] of plan.plan.plannedBranches.entries()) {
		branches.push(await branchStatus(plan, branch, index, deps));
	}
	const firstIncomplete = branches.find((branch) => !branch.complete)?.branch;
	const warnings = [
		...(dirtyWorktree ? ["dirty worktree"] : []),
		...branches.flatMap((branch) => branch.warnings.map((warning) => `${branch.branch}: ${warning}`)),
	];
	return firstIncomplete
		? { plan, dirtyWorktree, branches, firstIncomplete, warnings }
		: { plan, dirtyWorktree, branches, warnings };
}

export function formatStackStatusReport(report: StackStatusReport): string {
	const lines = [
		`# Stack Status: ${report.plan.plan.objective}`,
		"",
		`Plan: ${report.plan.locator.namespace}/${report.plan.locator.key} on ${report.plan.locator.branch}`,
		`Plan SHA-256: ${report.plan.plan.sha256}`,
		`Source: ${report.plan.source}`,
		`Dirty worktree: ${report.dirtyWorktree ? "yes" : "no"}`,
		`First incomplete branch: ${report.firstIncomplete ?? "none"}`,
		"",
		"## Branches",
		"",
	];

	for (const branch of report.branches) {
		lines.push(
			`- ${branch.complete ? "[x]" : "[ ]"} ${branch.branch} (parent: ${branch.intendedParent}; git: ${branch.gitBranchExists ? "yes" : "no"}; ledger: ${branch.ledgerPresent ? "yes" : "no"}; handoff: ${branch.handoffPresent ? "yes" : "no"})`,
		);
		for (const warning of branch.warnings) {
			lines.push(`  - warning: ${warning}`);
		}
	}

	if (report.warnings.length > 0) {
		lines.push("", "## Warnings", "");
		for (const warning of report.warnings) {
			lines.push(`- ${warning}`);
		}
	}

	return `${lines.join("\n")}\n`;
}
