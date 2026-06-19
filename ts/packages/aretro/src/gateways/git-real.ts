import { RealGitGateway, type GitResult } from "@asdl/core/git";
import type { CommandExecApi } from "@asdl/core/exec";

import type { AretroGitGateway, AretroGitParams } from "./git.ts";

export class RealAretroGitGateway implements AretroGitGateway {
	private readonly git: RealGitGateway;

	constructor(execApi: CommandExecApi) {
		this.git = new RealGitGateway(execApi);
	}

	async isGitRepository(params: AretroGitParams): Promise<boolean> {
		const result = await this.git.gitPath({ cwd: params.cwd, relativePath: "." });
		return result.ok;
	}

	async getRepositoryRoot(params: AretroGitParams): Promise<GitResult<string>> {
		return await this.git.repoRoot({ cwd: params.cwd });
	}

	async getCurrentBranch(params: AretroGitParams): Promise<GitResult<string>> {
		return await this.git.currentBranch({ cwd: params.cwd });
	}
}
