import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";

import type { HerdrGateway } from "../core/herdr-gateway.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

export type HerdrGitGateway = Pick<
	GitGateway,
	"createBranchAtStartPoint" | "currentBranch" | "optionalRepoRoot"
>;

export class HerdrPiContext {
	readonly commands: HerdrPiCommandApi;
	readonly git: HerdrGitGateway;
	readonly graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	readonly herdr: HerdrGateway;
	readonly pi: CommandContext;

	constructor(options: {
		commands: HerdrPiCommandApi;
		git: HerdrGitGateway;
		graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
		herdr: HerdrGateway;
		pi: CommandContext;
	}) {
		this.commands = options.commands;
		this.git = options.git;
		this.graphite = options.graphite;
		this.herdr = options.herdr;
		this.pi = options.pi;
	}
}
