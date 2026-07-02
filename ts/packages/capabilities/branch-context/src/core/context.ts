import { RealGitBrmemGateway, type BrmemGateway } from "@sdl/brmem";
import { NodeCommandExecApi } from "@sdl/core/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/capability-kit/git";
import type { GitGateway } from "@sdl/capability-kit/git";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@sdl/capability-kit/graphite/branch";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
}

export interface BranchContextContextOptions {
	cwd?: string;
}

export type BranchContextContextFactory<Args extends unknown[]> = (
	...args: Args
) => BranchContextContext;

export function createBranchContextContext(
	commands: StdinCapableCommandExecApi,
	options: BranchContextContextOptions = {},
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
	options: BranchContextContextOptions = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}
