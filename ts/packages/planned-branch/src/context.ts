import { NodeCommandExecApi, runCommand, type CommandExecApi, type ExecOptions, type ExecResult } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealPlannedBranchBrmemGateway, type PlannedBranchBrmemGateway } from "./brmem-gateway.ts";
import { RealPlannedBranchGraphiteGateway, type PlannedBranchGraphiteGateway } from "./graphite-gateway.ts";

export interface PlannedBranchContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem?: PlannedBranchBrmemGateway | undefined;
	graphite?: PlannedBranchGraphiteGateway | undefined;
}

export function createRealPlannedBranchContext(): PlannedBranchContext {
	const commands = new RealCommandExecApi();
	return {
		commands,
		git: new RealGitGateway(commands),
		brmem: new RealPlannedBranchBrmemGateway(commands),
		graphite: new RealPlannedBranchGraphiteGateway(commands),
	};
}

export class RealCommandExecApi extends NodeCommandExecApi {}

export { runCommand, type ExecOptions, type ExecResult };
