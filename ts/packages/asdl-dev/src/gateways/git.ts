import { runCommand, type ExecOptions, type ExecResult } from "@asdl/core/exec";
import { err, ok, type ErrorInfo, type GatewayResult } from "../result.ts";

const STDERR_DETAIL_LIMIT_CHARS = 1_200;

type CommandRunner = (command: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

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
		const commandError = commandFailure("git", ["branch", "--show-current"], result, "branch_unresolved", "Could not resolve the current git branch.");
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
		const commandError = commandFailure("git", ["rev-parse", "--show-toplevel"], result, "repo_root_unresolved", "Could not resolve the git repository root.");
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

function commandFailure(command: string, args: readonly string[], result: ExecResult, code: string, message: string): ErrorInfo | undefined {
	if (result.code === 0 && !result.killed) {
		return undefined;
	}

	const details: Record<string, unknown> = {
		command,
		args: [...args],
		exit_code: result.code,
	};
	if (isStartupFailure(result)) {
		details.startup_error = result.stderr;
	}
	const stderr = tailText(result.stderr, STDERR_DETAIL_LIMIT_CHARS);
	if (stderr !== "") {
		details.stderr = stderr;
	}

	return { code, message, details };
}

function isStartupFailure(result: ExecResult): boolean {
	return result.code === 127 && !result.killed && result.stderr.trim().length > 0;
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
