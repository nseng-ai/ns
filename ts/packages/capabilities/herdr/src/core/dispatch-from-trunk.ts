/**
 * Herdr dispatch-from-trunk: creates a branch from the refreshed Graphite
 * trunk, stores a Branch Memory prompt payload, and opens the branch in a new
 * Herdr workspace.
 *
 * Trunk refresh and branch creation reuse the cmux capability's tested
 * `createTrackedBranchFromTrunkForPrompt` export (ns-owned). The Herdr
 * workspace opening is handled by `openBranchInHerdrWorkspace`.
 */
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { createTrackedBranchFromTrunkForPrompt } from "@nseng-ai/cmux/api";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import { getPiLaunchOptions } from "@nseng-ai/capability-kit/cmux/pi-launch";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
import {
	buildBrmemPayloadPiLaunchCommand,
	buildLaunchPrompt,
	formatDispatchPromptStorageFailure,
	resolveDispatchPromptPayloadOptions,
	storeDispatchPromptPayload,
	type DispatchPromptPayloadOptions,
} from "./dispatch-prompt.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

type DispatchFromTrunkRuntime = HerdrPiCommandApi;

const COMMAND_NAME = HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

export interface HerdrSlotDispatchFromTrunkOptions extends DispatchPromptPayloadOptions {
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export interface HandleHerdrSlotDispatchFromTrunkOptions {
	pi: DispatchFromTrunkRuntime;
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
	const { pi, herdr, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	await ctx.waitForIdle();

	const branch = await createTrackedBranchFromTrunkForPrompt({
		pi,
		cwd: ctx.cwd,
		prompt,
		graphite: options.graphite,
		git: options.git,
		notify: options.notifyProgress,
		...optionalEntry("metadataDbAccess", options.metadataDbAccess),
	});
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	options.notifyProgress("Storing dispatch prompt in Branch Memory…");
	const stored = await storeDispatchPromptPayload({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		content: buildLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		payloadOptions,
	});
	if (!stored.ok) {
		ctx.ui.notify(formatDispatchPromptStorageFailure(branch.branchName, stored.error), "error");
		return;
	}

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const slotClient = options.slotClient ?? createHerdrSlotClient({ cwd: ctx.cwd });
	await openBranchInHerdrWorkspace({
		pi,
		herdr,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildBrmemPayloadPiLaunchCommand(branch.branchName, launchOptions),
		description: `herdr dispatch-from-trunk from ${branch.parentBranch}`,
		slotClient,
		notify: (message, level) => ctx.ui.notify(message, level),
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

export function createRealHerdrDispatchFromTrunkDeps(pi: DispatchFromTrunkRuntime): {
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
} {
	return {
		graphite: new RealGraphiteBranchGateway(pi),
		git: new RealGitGateway(pi),
	};
}
