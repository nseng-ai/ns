import { RealGitBrmemGateway, type BrmemGateway } from "@sdl/brmem";
import { NodeCommandExecApi } from "@sdl/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@sdl/exec";
import { RealGitGateway } from "@sdl/git";
import type { GitGateway } from "@sdl/git";
import { RealGraphiteBranchGateway, type GraphiteBranchGateway } from "@sdl/graphite/branch";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
}

export function createBranchContextContext(
	commands: StdinCapableCommandExecApi,
	options: { cwd?: string } = {},
): BranchContextContext {
	const cwd = options.cwd ?? process.cwd();
	const git = new RealGitGateway(commands);
	const brmem = new RealGitBrmemGateway({ cwd, commands, git });
	return {
		commands,
		git,
		brmem,
		graphite: new RealGraphiteBranchGateway(commands),
	};
}

export function createRealBranchContextContext(
	options: { cwd?: string } = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}
