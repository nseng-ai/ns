import { access } from "node:fs/promises";
import process from "node:process";

import { NodeCommandExecApi, type CommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/git";
import type { GitGateway } from "@sdl/capability-kit/git";

import { resolveSdlXdgPath } from "@sdl/core/xdg";

import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";

export interface BrmemPromptResolver {
	repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>>;
	globalPromptRoots(): readonly string[];
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

	globalPromptRoots(): readonly string[] {
		const roots: string[] = [];
		const xdgRoot = resolveSdlXdgPath({
			kind: "config",
			env: this.env,
			segments: ["brmem", "prompts"],
		});
		if (xdgRoot.ok) roots.push(xdgRoot.value);

		return [...new Set(roots)];
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
