import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import type { HerdrGateway } from "@nseng-ai/herdr/api";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import type { HerdrSlotLabelInputResolver } from "../core/resource-label.ts";

export type HerdrGitGateway = Pick<
	GitGateway,
	| "cachedOriginHeadBranch"
	| "createBranchAtStartPoint"
	| "currentBranch"
	| "headCommit"
	| "optionalRepoRoot"
	| "repoRoot"
>;

export interface HerdrPiContext {
	readonly commands: HerdrPiCommandApi;
	readonly git: HerdrGitGateway;
	readonly projectConfig: ProjectConfigGateway;
	readonly herdr: HerdrGateway;
	readonly resolveSlotLabelInput: HerdrSlotLabelInputResolver;
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
