import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealBranchContextBrmemGateway, type BranchContextBrmemGateway } from "./brmem-gateway.ts";
import { RealBranchContextGraphiteGateway, type BranchContextGraphiteGateway } from "./graphite-gateway.ts";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BranchContextBrmemGateway;
	graphite: BranchContextGraphiteGateway;
}

export function createBranchContextContext(commands: CommandExecApi): BranchContextContext {
	return {
		commands,
		git: new RealGitGateway(commands),
		brmem: new RealBranchContextBrmemGateway(commands),
		graphite: new RealBranchContextGraphiteGateway(commands),
	};
}

export function createRealBranchContextContext(): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi());
}
