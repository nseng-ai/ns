import { RealGitBrmemGateway, type BrmemGateway } from "@ns/brmem";
import { NodeCommandExecApi } from "@ns/core/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@ns/core/exec";
import { RealGitGateway } from "@ns/capability-kit/git";
import type { GitGateway } from "@ns/capability-kit/git";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@ns/capability-kit/graphite/branch";

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
