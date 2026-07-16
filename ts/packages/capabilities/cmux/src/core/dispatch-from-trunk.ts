import {
	createTrackedBranchFromTrunkForPrompt,
	TRUNK_DISPATCH_CONTEXT_NOTE,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { SlotClient } from "@nseng-ai/slots/api";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";

import { CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
import {
	buildLaunchPrompt,
	dispatchTrackedBranchPrompt,
	resolveDispatchPromptPayloadOptions,
} from "./dispatch-prompt.ts";
import type { CccPiCommandApi } from "./pi-command-api.ts";

type DispatchFromTrunkRuntime = CommandExecApi & Pick<CccPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;

export async function handleCccSlotDispatchFromTrunk(options: {
	pi: DispatchFromTrunkRuntime;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	const prompt = options.args.trim();
	if (prompt.length === 0) {
		options.ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}
	await options.ctx.waitForIdle();
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
		ctx: options.ctx,
		branch,
		content: buildLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		description: `dispatch-from-trunk from ${branch.parentBranch}`,
		payloadOptions: options.payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}
