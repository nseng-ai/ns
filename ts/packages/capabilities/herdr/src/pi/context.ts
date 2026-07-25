import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";

import type { HerdrGateway } from "../core/herdr-gateway.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

export type HerdrGitGateway = Pick<
	GitGateway,
	"createBranchAtStartPoint" | "currentBranch" | "headCommit" | "optionalRepoRoot" | "repoRoot"
>;

export interface HerdrPiContext {
	readonly commands: HerdrPiCommandApi;
	readonly git: HerdrGitGateway;
	readonly trunkBranch: string;
	readonly herdr: HerdrGateway;
}

export interface HerdrPiCommandContext extends HerdrPiContext {
	readonly pi: CommandContext;
}

export function createHerdrPiCommandContext(
	context: HerdrPiContext,
	pi: CommandContext,
): HerdrPiCommandContext {
	return { ...context, pi };
}
