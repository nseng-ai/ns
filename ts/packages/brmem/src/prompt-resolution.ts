import { access } from "node:fs/promises";
import { homedir } from "node:os";
import process from "node:process";

import { NodeCommandExecApi, formatCommand, type CommandExecApi } from "@asdl/core/exec";

import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";

interface GitRunResult {
	code: number;
	stdout: string;
	displayCommand: string;
}

export interface BrmemPromptResolver {
	repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>>;
	homeRoot(): string;
	fileExists(path: string): Promise<boolean>;
}

export class RealBrmemPromptResolver implements BrmemPromptResolver {
	private readonly commands: CommandExecApi;
	private readonly env: NodeJS.ProcessEnv;

	constructor(options: { commands?: CommandExecApi | undefined; env?: NodeJS.ProcessEnv | undefined } = {}) {
		this.commands = options.commands ?? new NodeCommandExecApi();
		this.env = options.env ?? process.env;
	}

	async repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>> {
		const result = await runGit(this.commands, ["rev-parse", "--show-toplevel"], { cwd: options.cwd, env: this.env });
		const repoRoot = result.stdout.trim();
		if (result.code !== 0 || repoRoot.length === 0) {
			return brmemError(
				"not-a-git-repo",
				`Not inside a git repository: ${options.cwd}. ` +
					"`brmem exec resolve-prompt` requires a git repo to resolve the project-local prompt path; run it from inside a checkout.",
				result.displayCommand,
			);
		}
		return brmemOk(repoRoot);
	}

	homeRoot(): string {
		const home = this.env.HOME;
		return home === undefined || home.length === 0 ? homedir() : home;
	}

	async fileExists(path: string): Promise<boolean> {
		try {
			await access(path);
			return true;
		} catch {
			return false;
		}
	}
}

async function runGit(
	commands: CommandExecApi,
	args: readonly string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<GitRunResult> {
	const result = await commands.exec("git", [...args], { cwd: options.cwd, env: options.env });
	return {
		code: result.code,
		stdout: result.stdout,
		displayCommand: formatCommand("git", args),
	};
}
