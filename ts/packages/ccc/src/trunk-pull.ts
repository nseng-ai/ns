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

export type TrunkPullDetailedResult =
	| {
			ok: true;
			trunk: string;
			command: "git";
			args: readonly string[];
			cwd: string;
			result: ExecResult;
	  }
	| {
			ok: false;
			reason: "trunk-command-failed" | "trunk-empty" | "worktree-list-failed" | "update-failed";
			trunk?: string | undefined;
			command: "gt" | "git";
			args: readonly string[];
			cwd: string;
			result: ExecResult;
	  };

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
	return formatTrunkPullResult(await runTrunkPullDetailed(commands, cwd));
}

export async function runTrunkPullDetailed(
	commands: Pick<TrunkPullCliInput, "exec">,
	cwd: string,
): Promise<TrunkPullDetailedResult> {
	const trunkArgs = ["trunk", "--no-interactive"];
	const trunkResult = await runGraphiteCommand(
		(command, args, options) => commands.exec(command, [...args], options),
		{
			cwd,
			args: trunkArgs,
			timeoutMs: GT_TIMEOUT_MS,
		},
	);
	if (!isSuccessfulExecResult(trunkResult)) {
		return {
			ok: false,
			reason: "trunk-command-failed",
			command: "gt",
			args: trunkArgs,
			cwd,
			result: trunkResult,
		};
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		return {
			ok: false,
			reason: "trunk-empty",
			command: "gt",
			args: trunkArgs,
			cwd,
			result: trunkResult,
		};
	}

	const worktreeArgs = ["worktree", "list", "--porcelain"];
	const worktreeResult = await commands.exec("git", worktreeArgs, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(worktreeResult)) {
		return {
			ok: false,
			reason: "worktree-list-failed",
			trunk,
			command: "git",
			args: worktreeArgs,
			cwd,
			result: worktreeResult,
		};
	}

	const plan = planLocalBranchRefreshFromWorktrees({
		branch: trunk,
		cwd,
		worktreePorcelain: worktreeResult.stdout,
	});
	const updateResult = await commands.exec("git", plan.args, {
		cwd: plan.cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(updateResult)) {
		return {
			ok: false,
			reason: "update-failed",
			trunk,
			command: "git",
			args: plan.args,
			cwd: plan.cwd,
			result: updateResult,
		};
	}

	return {
		ok: true,
		trunk,
		command: "git",
		args: plan.args,
		cwd: plan.cwd,
		result: updateResult,
	};
}

function formatTrunkPullResult(
	result: TrunkPullDetailedResult,
): { ok: true; message: string } | { ok: false; message: string } {
	if (result.ok) {
		return {
			ok: true,
			message: formatSuccess({
				trunk: result.trunk,
				result: result.result,
				args: result.args,
				cwd: result.cwd,
			}),
		};
	}

	switch (result.reason) {
		case "trunk-command-failed":
			return {
				ok: false,
				message: formatCommandFailure(
					"Could not resolve Graphite trunk. Local trunk was not updated.",
					formatCommand(result.command, result.args),
					result.result,
				),
			};
		case "trunk-empty":
			return {
				ok: false,
				message: "gt trunk --no-interactive returned no branch. Local trunk was not updated.",
			};
		case "worktree-list-failed":
			return {
				ok: false,
				message: formatCommandFailure(
					"Could not inspect Git worktrees. Local trunk was not updated.",
					formatCommand(result.command, result.args),
					result.result,
				),
			};
		case "update-failed":
			return {
				ok: false,
				message: formatCommandFailureWithCwd(
					`Could not update local trunk branch \`${result.trunk}\`.`,
					formatCommand(result.command, result.args),
					result.cwd,
					result.result,
				),
			};
	}
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
