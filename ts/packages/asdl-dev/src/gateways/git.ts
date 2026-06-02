import { runCommand, type CommandResult, type CommandRunner } from "../command-runner.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "../result.ts";

const STDERR_DETAIL_LIMIT = 1_200;

export interface GitGateway {
	currentBranch(params: { cwd: string }): Promise<GatewayResult<string>>;
	repoRoot(params: { cwd: string }): Promise<GatewayResult<string>>;
}

export class RealGitGateway implements GitGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async currentBranch(params: { cwd: string }): Promise<GatewayResult<string>> {
		const result = await this.runner("git", ["branch", "--show-current"], { cwd: params.cwd });
		const commandError = commandFailure(result, "branch_unresolved", "Could not resolve the current git branch.");
		if (commandError !== undefined) {
			return err(commandError);
		}

		const branch = nonBlank(result.stdout);
		if (branch === undefined) {
			return err({
				code: "detached_head",
				message: "Could not determine current branch; HEAD may be detached. Pass --branch to select a branch explicitly.",
			});
		}

		return ok(branch);
	}

	async repoRoot(params: { cwd: string }): Promise<GatewayResult<string>> {
		const result = await this.runner("git", ["rev-parse", "--show-toplevel"], { cwd: params.cwd });
		const commandError = commandFailure(result, "repo_root_unresolved", "Could not resolve the git repository root.");
		if (commandError !== undefined) {
			return err(commandError);
		}

		const root = nonBlank(result.stdout);
		if (root === undefined) {
			return err({ code: "repo_root_unresolved", message: "Git repository root command returned no path." });
		}

		return ok(root);
	}
}

function commandFailure(result: CommandResult, code: string, message: string): ErrorInfo | undefined {
	if (result.exitCode === 0 && result.startupError === undefined) {
		return undefined;
	}

	const details: Record<string, unknown> = {
		command: result.command,
		args: result.args,
		exit_code: result.exitCode,
	};
	if (result.startupError !== undefined) {
		details.startup_error = result.startupError;
	}
	const stderr = tailText(result.stderr, STDERR_DETAIL_LIMIT);
	if (stderr !== "") {
		details.stderr = stderr;
	}

	return { code, message, details };
}

function tailText(text: string, maxChars: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}
	return `…${trimmed.slice(-maxChars)}`;
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
