import { NodeCommandExecApi, runCommand, type ExecResult, type ExecOptions, type PlanCommandExecApi } from "@asdl/plans";

import { RealPlannedBranchBrmemGateway, type PlannedBranchBrmemGateway } from "./brmem-gateway.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import { RealPlannedBranchGraphiteGateway, type PlannedBranchGraphiteGateway } from "./graphite-gateway.ts";

export interface PlannedBranchContext {
	commands: PlanCommandExecApi;
	git: PlannedBranchGitGateway;
	brmem?: PlannedBranchBrmemGateway | undefined;
	graphite?: PlannedBranchGraphiteGateway | undefined;
}

export function createRealPlannedBranchContext(): PlannedBranchContext {
	const commands = new RealCommandExecApi();
	return {
		commands,
		git: new RealPlannedBranchGitGateway(commands),
		brmem: new RealPlannedBranchBrmemGateway(commands),
		graphite: new RealPlannedBranchGraphiteGateway(commands),
	};
}

export class RealCommandExecApi extends NodeCommandExecApi {}

export { runCommand, type ExecOptions, type ExecResult };
