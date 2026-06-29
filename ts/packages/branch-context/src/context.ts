import { RealGitBrmemGateway, type BrmemGateway } from "@sdl/brmem";
import {
	NodeCommandExecApi,
	type CommandExecApi,
	type StdinCapableCommandExecApi,
} from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/git";
import type { GitGateway } from "@sdl/capability-kit/git";
import { RealGraphiteBranchGateway, type GraphiteBranchGateway } from "@sdl/graphite/branch";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
}

export function createBranchContextContext(
	commands: StdinCapableCommandExecApi,
	options: { cwd?: string | undefined } = {},
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
	options: { cwd?: string | undefined } = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}
