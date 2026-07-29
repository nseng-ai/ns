import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/pi";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import { buildTrackedBranchPayloadLaunchCommand } from "@nseng-ai/extension-kit/tracked-branch-payload";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";

import type { HerdrCommandContext, HerdrGateway, HerdrPiCommandApi } from "@nseng-ai/herdr/api";

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
	readonly pi: CommandContext & HerdrCommandContext;
	readonly buildLaunchCommand: (
		prompt: string,
		profile: ReturnType<typeof getPiLaunchOptions>,
	) => string;
	readonly resolveLaunchProfile: (
		commands: HerdrPiCommandApi,
		context: HerdrCommandContext,
	) => ReturnType<typeof getPiLaunchOptions>;
	readonly formatBranchContextCommand: typeof formatImplBranchContextCommand;
	readonly buildTrackedBranchLaunchCommand: (
		branchName: string,
		profile: ReturnType<typeof getPiLaunchOptions>,
	) => string;
}

export function createHerdrPiCommandContext(
	context: HerdrPiContext,
	pi: HerdrCommandContext,
): HerdrPiCommandContext {
	const commandContext = pi as CommandContext & HerdrCommandContext;
	return {
		...context,
		pi: commandContext,
		buildLaunchCommand: (prompt, profile) => buildPiLaunchCommand(prompt, profile),
		resolveLaunchProfile: (_commands, commandContext) =>
			getPiLaunchOptions(
				context.commands as Parameters<typeof getPiLaunchOptions>[0],
				commandContext as CommandContext,
			),
		formatBranchContextCommand: formatImplBranchContextCommand,
		buildTrackedBranchLaunchCommand: (branchName, profile) =>
			buildTrackedBranchPayloadLaunchCommand(branchName, profile),
	};
}
