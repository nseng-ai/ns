import {
	buildTrackedBranchLaunchPrompt,
	createTrackedBranchFromTrunkForPrompt,
	TRUNK_DISPATCH_CONTEXT_NOTE,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME } from "./command-surfaces.ts";
import {
	dispatchTrackedBranchPrompt,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "./dispatch-prompt.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { formatGoalWorkspaceLabel, generateWorkspaceGoalSlug } from "./space-goal.ts";
import { slotLabelInput } from "./workspace-label.ts";

const COMMAND_NAME = HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME;

export interface HerdrSlotDispatchFromTrunkOptions extends DispatchPromptPayloadOptions {
	metadataDbAccess?: GraphiteMetadataDbAccess;
}
export interface HandleHerdrSlotDispatchFromTrunkOptions {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotDispatchFromTrunk(
	options: HandleHerdrSlotDispatchFromTrunkOptions,
): Promise<void> {
	const prompt = options.args.trim();
	if (prompt.length === 0) {
		options.ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}
	await options.ctx.waitForIdle();
	options.notifyProgress("Generating workspace name…");
	const workspaceSlug = await generateWorkspaceGoalSlug(options.pi, options.ctx.cwd, prompt);
	if (!workspaceSlug.ok) {
		options.ctx.ui.notify(workspaceSlug.message, "error");
		return;
	}
	const branch = await createTrackedBranchFromTrunkForPrompt({
		pi: options.pi,
		cwd: options.ctx.cwd,
		prompt,
		graphite: options.graphite,
		git: options.git,
		notify: options.notifyProgress,
		...optionalEntry("metadataDbAccess", options.metadataDbAccess),
	});
	if ("error" in branch) {
		options.ctx.ui.notify(branch.error, "error");
		return;
	}
	await dispatchTrackedBranchPrompt({
		pi: options.pi,
		herdr: options.herdr,
		ctx: options.ctx,
		branch,
		content: buildTrackedBranchLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		description: `herdr dispatch-from-trunk from ${branch.parentBranch}`,
		workspaceLabel: (worktreePath) =>
			formatGoalWorkspaceLabel({
				slug: workspaceSlug.text,
				...slotLabelInput(worktreePath),
			}),
		successDetails: { parentLabel: "Parent (trunk)", entryLocator: "omit" },
		payloadOptions: options.payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

export function createRealHerdrDispatchFromTrunkDeps(pi: HerdrPiCommandApi): {
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
} {
	return { graphite: new RealGraphiteBranchGateway(pi), git: new RealGitGateway(pi) };
}
