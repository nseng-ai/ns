import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { EffectiveProjectConfig } from "@nseng-ai/sdk/project-config";

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
>;

export interface HerdrProjectConfigScope {
	readonly cwd: string;
	readonly signal?: AbortSignal;
}

export interface HerdrPiContext {
	readonly commands: HerdrPiCommandApi;
	readonly git: HerdrGitGateway;
	readonly herdr: HerdrGateway;
	readonly createProjectConfig: (scope: HerdrProjectConfigScope) => EffectiveProjectConfig;
	readonly resolveSlotLabelInput?: HerdrSlotLabelInputResolver;
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
