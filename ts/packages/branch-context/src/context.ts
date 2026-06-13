import { NodeCommandExecApi, runCommand, type CommandExecApi, type ExecOptions, type ExecResult } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealBranchContextBrmemGateway, type BranchContextBrmemGateway } from "./brmem-gateway.ts";
import { RealBranchContextGraphiteGateway, type BranchContextGraphiteGateway } from "./graphite-gateway.ts";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem?: BranchContextBrmemGateway | undefined;
	graphite?: BranchContextGraphiteGateway | undefined;
}

export function createRealBranchContextContext(): BranchContextContext {
	const commands = new RealCommandExecApi();
	return {
		commands,
		git: new RealGitGateway(commands),
		brmem: new RealBranchContextBrmemGateway(commands),
		graphite: new RealBranchContextGraphiteGateway(commands),
	};
}

export class RealCommandExecApi extends NodeCommandExecApi {}

export { runCommand, type ExecOptions, type ExecResult };
