import { access } from "node:fs/promises";
import { homedir } from "node:os";
import process from "node:process";

import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";

export interface BrmemPromptResolver {
	repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>>;
	homeRoot(): string;
	fileExists(path: string): Promise<boolean>;
}

export class RealBrmemPromptResolver implements BrmemPromptResolver {
	private readonly git: GitGateway;
	private readonly env: NodeJS.ProcessEnv;

	constructor(
		options: {
			commands?: CommandExecApi | undefined;
			env?: NodeJS.ProcessEnv | undefined;
			git?: GitGateway | undefined;
		} = {},
	) {
		const commands = options.commands ?? new NodeCommandExecApi();
		this.git = options.git ?? new RealGitGateway(commands);
		this.env = options.env ?? process.env;
	}

	async repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>> {
		const result = await this.git.repoRoot({ cwd: options.cwd });
		if (!result.ok) {
			return brmemError(
				"not-a-git-repo",
				`Not inside a git repository: ${options.cwd}. ` +
					"`brmem exec resolve-prompt` requires a git repo to resolve the project-local prompt path; run it from inside a checkout.",
				result.error.displayCommand,
			);
		}
		return brmemOk(result.value);
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
