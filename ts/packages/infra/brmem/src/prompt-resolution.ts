import { access } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";

import { resolveXdgHome } from "@nseng-ai/foundation/xdg-path";

import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";
import type { BrmemEnvOption } from "./env.ts";

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
			commands?: CommandExecApi;
			env?: BrmemEnvOption;
			git?: GitGateway;
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
		const configHome = resolveXdgHome("config", this.env);
		if (configHome.ok) roots.push(join(configHome.value, "ns", "brmem", "prompts"));

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
