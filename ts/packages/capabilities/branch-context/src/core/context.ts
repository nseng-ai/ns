import { RealGitBrmemGateway, type BrmemGateway } from "@nseng-ai/brmem";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@nseng-ai/capability-kit/graphite/branch";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
}

export interface BranchContextContextOptions {
	cwd?: string;
	brmemCommands?: StdinCapableCommandExecApi;
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
	const brmemCommands = options.brmemCommands ?? commands;
	const brmemGit = brmemCommands === commands ? git : new RealGitGateway(brmemCommands);
	const brmem = new RealGitBrmemGateway({ cwd, commands: brmemCommands, git: brmemGit });
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
