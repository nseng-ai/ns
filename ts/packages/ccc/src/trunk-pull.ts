import {
	formatCommand,
	formatCommandFailure,
	formatOutputSection,
	isSuccessfulExecResult,
	type ExecResult,
} from "@sdl/core/exec";
import { planLocalBranchRefreshFromWorktrees } from "@sdl/core/git";
import { runGraphiteCommand } from "@sdl/graphite/branch";

const GT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

export interface TrunkPullCliInput {
	cwd: string;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string | undefined; timeout?: number | undefined },
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
}

export async function runTrunkPullCli(input: TrunkPullCliInput): Promise<number> {
	const result = await runTrunkPull({ exec: input.exec }, input.cwd);
	const output = `${result.message.trimEnd()}\n`;
	if (result.ok) {
		input.stdout(output);
		return 0;
	}
	input.stderr(output);
	return 1;
}

export async function runTrunkPull(
	commands: Pick<TrunkPullCliInput, "exec">,
	cwd: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
	const trunkResult = await runGraphiteCommand(
		(command, args, options) => commands.exec(command, [...args], options),
		{
			cwd,
			args: ["trunk", "--no-interactive"],
			timeoutMs: GT_TIMEOUT_MS,
		},
	);
	if (!isSuccessfulExecResult(trunkResult)) {
		return {
			ok: false,
			message: formatCommandFailure(
				"Could not resolve Graphite trunk. Local trunk was not updated.",
				"gt trunk --no-interactive",
				trunkResult,
			),
		};
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		return {
			ok: false,
			message: "gt trunk --no-interactive returned no branch. Local trunk was not updated.",
		};
	}

	const planResult = await planTrunkPull(commands, cwd, trunk);
	if (!planResult.ok) return planResult;

	const updateResult = await commands.exec("git", planResult.args, {
		cwd: planResult.cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(updateResult)) {
		return {
			ok: false,
			message: formatCommandFailureWithCwd(
				`Could not update local trunk branch \`${trunk}\`.`,
				formatCommand("git", planResult.args),
				planResult.cwd,
				updateResult,
			),
		};
	}

	return {
		ok: true,
		message: formatSuccess({
			trunk,
			result: updateResult,
			args: planResult.args,
			cwd: planResult.cwd,
		}),
	};
}

async function planTrunkPull(
	commands: Pick<TrunkPullCliInput, "exec">,
	cwd: string,
	trunk: string,
): Promise<{ ok: true; args: string[]; cwd: string } | { ok: false; message: string }> {
	const worktreeResult = await commands.exec("git", ["worktree", "list", "--porcelain"], {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(worktreeResult)) {
		return {
			ok: false,
			message: formatCommandFailure(
				"Could not inspect Git worktrees. Local trunk was not updated.",
				"git worktree list --porcelain",
				worktreeResult,
			),
		};
	}

	const plan = planLocalBranchRefreshFromWorktrees({
		branch: trunk,
		cwd,
		worktreePorcelain: worktreeResult.stdout,
	});
	return { ok: true, args: plan.args, cwd: plan.cwd };
}

function formatCommandFailureWithCwd(
	title: string,
	command: string,
	cwd: string,
	result: ExecResult,
): string {
	return [formatCommandFailure(title, command, result), `Cwd: ${cwd}`].join("\n");
}

function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

interface FormatSuccessOptions {
	trunk: string;
	args: readonly string[];
	cwd: string;
	result: ExecResult;
}

function formatSuccess(options: FormatSuccessOptions): string {
	return [
		`Pulled local Graphite trunk branch \`${options.trunk}\` only.`,
		"No full `gt sync` was run.",
		`Command: ${formatCommand("git", options.args)}`,
		`Cwd: ${options.cwd}`,
		formatOutputSection("stdout", options.result.stdout, { maxChars: 4_000, maxLines: 80 }),
		formatOutputSection("stderr", options.result.stderr, { maxChars: 4_000, maxLines: 80 }),
	].join("\n");
}
