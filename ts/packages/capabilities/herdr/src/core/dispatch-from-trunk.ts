import {
	buildTrackedBranchLaunchPrompt,
	buildTrackedBranchPayloadLaunchCommand,
	createTrackedBranchFromTrunkForPrompt,
	formatTrackedBranchPayloadStorageFailure,
	storeTrackedBranchPayload,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import { getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
import {
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "./dispatch-prompt.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";

const COMMAND_NAME = HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

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
	options.notifyProgress("Storing dispatch prompt in Branch Memory…");
	const stored = await storeTrackedBranchPayload({
		pi: options.pi,
		cwd: options.ctx.cwd,
		branchName: branch.branchName,
		content: buildTrackedBranchLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		payloadOptions: options.payloadOptions,
	});
	if (!stored.ok) {
		options.ctx.ui.notify(
			formatTrackedBranchPayloadStorageFailure(branch.branchName, stored.error, "Herdr workspace"),
			"error",
		);
		return;
	}
	await openBranchInHerdrWorkspace({
		pi: options.pi,
		herdr: options.herdr,
		cwd: options.ctx.cwd,
		branchName: branch.branchName,
		command: buildTrackedBranchPayloadLaunchCommand(
			branch.branchName,
			getPiLaunchOptions(options.pi, options.ctx),
		),
		description: `herdr dispatch-from-trunk from ${branch.parentBranch}`,
		slotClient: options.slotClient ?? createHerdrSlotClient({ cwd: options.ctx.cwd }),
		notify: (message, level) => options.ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened Herdr workspace: ${target.branchName}`,
				`Parent (trunk): ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
			].join("\n"),
		notifyProgress: options.notifyProgress,
	});
}

export { resolveDispatchPromptPayloadOptions, type DispatchPromptPayloadOptions };
export function createRealHerdrDispatchFromTrunkDeps(pi: HerdrPiCommandApi): {
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
} {
	return { graphite: new RealGraphiteBranchGateway(pi), git: new RealGitGateway(pi) };
}
