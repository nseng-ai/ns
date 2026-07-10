import {
	commandSucceeded,
	execApiToCommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
import { z } from "zod";

const GIT_STATUS_TIMEOUT_MS = 60_000;
const SLOT_STACK_BRANCHES_TIMEOUT_MS = 60_000;
const GT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000;

const STACK_BRANCHES_ARGS = [
	"slot",
	"gt",
	"exec",
	"stack-branches",
	"--downstack",
	"--format",
	"json",
] as const;

interface StackSquashCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export interface StackSquashOptions {
	cwd: string;
	onProgress?: (message: string) => void;
}

export interface ProcessedStackBranch {
	branch: string;
	state: "squashed" | "already_one_commit";
}

export interface StackSquashCommandFailure {
	command: "git" | "ns" | "gt";
	args: readonly string[];
	cwd: string;
	execResult: ExecResult;
}

export type StackSquashOutcome =
	| { kind: "success"; processed: readonly ProcessedStackBranch[] }
	| ({ kind: "worktree-probe-failed" } & StackSquashCommandFailure)
	| { kind: "worktree-dirty"; status: string; cwd: string }
	| ({ kind: "stack-discovery-failed"; message: string } & StackSquashCommandFailure)
	| { kind: "empty-stack"; cwd: string }
	| ({ kind: "checkout-failed"; branch: string } & StackSquashCommandFailure)
	| ({ kind: "squash-failed"; branch: string } & StackSquashCommandFailure)
	| ({ kind: "tip-restore-failed"; branch: string } & StackSquashCommandFailure);

const stackBranchesEnvelopeSchema = z.object({
	status: z.string(),
	exitCode: z.number().optional(),
	message: z.string().optional(),
	data: z
		.object({
			branches: z.array(z.string()),
		})
		.optional(),
});

export async function runStackSquashFlow(
	commands: StackSquashCommands,
	options: StackSquashOptions,
): Promise<StackSquashOutcome> {
	const statusArgs = ["status", "--porcelain=v1"];
	const status = await commands.exec("git", statusArgs, {
		cwd: options.cwd,
		timeout: GIT_STATUS_TIMEOUT_MS,
	});
	if (!commandSucceeded(status)) {
		return commandFailure("worktree-probe-failed", "git", statusArgs, options.cwd, status);
	}
	if (status.stdout.trim().length > 0) {
		return { kind: "worktree-dirty", status: status.stdout.trim(), cwd: options.cwd };
	}

	const stackResult = await commands.exec("ns", [...STACK_BRANCHES_ARGS], {
		cwd: options.cwd,
		timeout: SLOT_STACK_BRANCHES_TIMEOUT_MS,
	});
	const stackDiscovery = parseStackDiscovery(stackResult);
	if (stackDiscovery.kind === "failure") {
		return {
			kind: "stack-discovery-failed",
			message: stackDiscovery.message,
			command: "ns",
			args: STACK_BRANCHES_ARGS,
			cwd: options.cwd,
			execResult: stackResult,
		};
	}
	const { branches } = stackDiscovery;
	if (branches.length === 0) return { kind: "empty-stack", cwd: options.cwd };

	const branchesFromTip = [...branches].reverse();
	const tipBranch = branchesFromTip[0];
	if (tipBranch === undefined) return { kind: "empty-stack", cwd: options.cwd };
	options.onProgress?.(
		`Preparing to squash ${branchesFromTip.length} Graphite stack branch${branchesFromTip.length === 1 ? "" : "es"} from ${tipBranch}.`,
	);

	const processed: ProcessedStackBranch[] = [];
	for (const branch of branchesFromTip) {
		const checkoutArgs = ["checkout", branch, "--no-interactive"];
		const checkout = await runGt(commands, options.cwd, checkoutArgs);
		if (!commandSucceeded(checkout)) {
			return {
				...commandFailure("checkout-failed", "gt", checkoutArgs, options.cwd, checkout),
				branch,
			};
		}

		options.onProgress?.(`Squashing ${branch}.`);
		const squashArgs = ["squash", "--no-edit", "--no-interactive"];
		const squash = await runGt(commands, options.cwd, squashArgs);
		if (!commandSucceeded(squash)) {
			if (!squash.killed && isAlreadyOneCommitSquashResult(squash)) {
				processed.push({ branch, state: "already_one_commit" });
				continue;
			}
			return {
				...commandFailure("squash-failed", "gt", squashArgs, options.cwd, squash),
				branch,
			};
		}
		processed.push({ branch, state: "squashed" });
	}

	const restoreArgs = ["checkout", tipBranch, "--no-interactive"];
	const restore = await runGt(commands, options.cwd, restoreArgs);
	if (!commandSucceeded(restore)) {
		return {
			...commandFailure("tip-restore-failed", "gt", restoreArgs, options.cwd, restore),
			branch: tipBranch,
		};
	}

	return { kind: "success", processed };
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
		case "checkout-failed":
			return `Could not check out Graphite branch \`${outcome.branch}\`; stack squash stopped.`;
		case "squash-failed":
			return `Could not squash Graphite branch \`${outcome.branch}\`; stack squash stopped.`;
		case "tip-restore-failed":
			return `Could not restore Graphite tip branch \`${outcome.branch}\`.`;
	}
}

export function formatStackSquashSummary(processed: readonly ProcessedStackBranch[]): string {
	return [
		`Processed ${processed.length} Graphite stack branch${processed.length === 1 ? "" : "es"}; each now has one commit.`,
		"",
		...processed.map((entry) =>
			entry.state === "already_one_commit"
				? `- ${entry.branch} (already one commit)`
				: `- ${entry.branch} (squashed)`,
		),
	].join("\n");
}

function parseStackDiscovery(
	result: ExecResult,
): { kind: "success"; branches: string[] } | { kind: "failure"; message: string } {
	if (!commandSucceeded(result)) {
		return {
			kind: "failure",
			message: "Could not read Graphite stack branches; not starting stack squash.",
		};
	}
	let value: unknown;
	try {
		value = JSON.parse(result.stdout);
	} catch (caught) {
		const message = caught instanceof Error ? caught.message : String(caught);
		return {
			kind: "failure",
			message: `Could not parse ns slot gt exec stack-branches JSON: ${message}`,
		};
	}
	const envelope = stackBranchesEnvelopeSchema.safeParse(value);
	if (!envelope.success) {
		return {
			kind: "failure",
			message: `Unexpected ns slot gt exec stack-branches JSON shape: ${envelope.error.message}`,
		};
	}
	if (envelope.data.status !== "ok" || envelope.data.data === undefined) {
		return {
			kind: "failure",
			message:
				envelope.data.message ??
				`ns slot gt exec stack-branches failed with status ${envelope.data.status}`,
		};
	}
	return { kind: "success", branches: envelope.data.data.branches };
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

function isAlreadyOneCommitSquashResult(result: ExecResult): boolean {
	return `${result.stdout}\n${result.stderr}`.includes(
		"Only one commit in branch, nothing to squash.",
	);
}

function commandFailure<Kind extends StackSquashOutcome["kind"]>(
	kind: Kind,
	command: StackSquashCommandFailure["command"],
	args: readonly string[],
	cwd: string,
	execResult: ExecResult,
): { kind: Kind } & StackSquashCommandFailure {
	return { kind, command, args, cwd, execResult };
}
