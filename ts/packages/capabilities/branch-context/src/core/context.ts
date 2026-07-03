import { RealGitBrmemGateway, type BrmemGateway } from "@ji/brmem";
import { NodeCommandExecApi } from "@ji/core/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@ji/core/exec";
import { RealGitGateway } from "@ji/capability-kit/git";
import type { GitGateway } from "@ji/capability-kit/git";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@ji/capability-kit/graphite/branch";

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
