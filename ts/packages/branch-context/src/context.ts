import { RealGitBrmemGateway, type BrmemGateway } from "@sdl/brmem";
import {
	NodeCommandExecApi,
	type CommandExecApi,
	type StdinCapableCommandExecApi,
} from "@sdl/core/exec";
import { RealGitGateway, type GitGateway } from "@sdl/core/git";
import {
	RealBranchContextGraphiteGateway,
	type BranchContextGraphiteGateway,
} from "./graphite-gateway.ts";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: BranchContextGraphiteGateway;
}

export function createBranchContextContext(
	commands: StdinCapableCommandExecApi,
	options: { cwd?: string | undefined } = {},
): BranchContextContext {
	const cwd = options.cwd ?? process.cwd();
	return {
		commands,
		git: new RealGitGateway(commands),
		brmem: new RealGitBrmemGateway(cwd, commands),
		graphite: new RealBranchContextGraphiteGateway(commands),
	};
}

export function createRealBranchContextContext(
	options: { cwd?: string | undefined } = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}
