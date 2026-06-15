import { NodeCommandExecApi, formatCommand, type CommandExecApi } from "@asdl/core/exec";

import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
	displayCommand: string;
}

export interface GitSetupGateway {
	remoteExists(remote: string): Promise<BrmemResult<boolean>>;
	getConfigValues(key: string): Promise<BrmemResult<readonly string[]>>;
	addConfigValue(key: string, value: string): Promise<BrmemResult<void>>;
}

export class RealGitSetupGateway implements GitSetupGateway {
	private readonly cwd: string;
	private readonly commands: CommandExecApi;

	constructor(cwd: string, commands: CommandExecApi = new NodeCommandExecApi()) {
		this.cwd = cwd;
		this.commands = commands;
	}

	async remoteExists(remote: string): Promise<BrmemResult<boolean>> {
		const result = await runGit(this.commands, ["remote", "get-url", remote], { cwd: this.cwd });
		if (result.code === 0) return brmemOk(true);
		return gitError("remote_not_found", `Git remote ${JSON.stringify(remote)} was not found.`, result);
	}

	async getConfigValues(key: string): Promise<BrmemResult<readonly string[]>> {
		const result = await runGit(this.commands, ["config", "--get-all", key], { cwd: this.cwd });
		if (result.code === 0) return brmemOk(splitConfigValues(result.stdout));
		if (result.code === 1) return brmemOk([]);
		return gitError("git_config_read_failed", `Could not read Git config ${JSON.stringify(key)}.`, result);
	}

	async addConfigValue(key: string, value: string): Promise<BrmemResult<void>> {
		const result = await runGit(this.commands, ["config", "--local", "--add", key, value], { cwd: this.cwd });
		if (result.code === 0) return brmemOk(undefined);
		return gitError("git_config_write_failed", `Could not add Git config ${JSON.stringify(key)}.`, result);
	}
}

async function runGit(commands: CommandExecApi, args: readonly string[], options: { cwd: string }): Promise<GitRunResult> {
	const result = await commands.exec("git", [...args], {
		cwd: options.cwd,
		env: process.env,
	});
	return {
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr.length > 0 ? result.stderr : (result.startupError ?? ""),
		displayCommand: formatCommand("git", args),
	};
}

function splitConfigValues(stdout: string): readonly string[] {
	return stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function commandMessage(message: string, result: GitRunResult): string {
	const stderr = result.stderr.trim();
	const details = stderr.length > 0 ? stderr : result.stdout.trim();
	return details.length === 0 ? message : `${message}: ${details}`;
}

function gitError<T>(code: string, message: string, result: GitRunResult): BrmemResult<T> {
	return brmemError(code, commandMessage(message, result), result.displayCommand);
}
