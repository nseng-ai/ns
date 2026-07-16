import {
	buildTrackedBranchLaunchPrompt,
	buildTrackedBranchPayloadLaunchCommand,
	createTrackedBranchForPrompt,
	formatTrackedBranchPayloadStorageFailure,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	type ResolvedTrackedBranchPayloadOptions,
	type TrackedBranchPayloadOptions,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import { getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME } from "./command-surfaces.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";

type DispatchPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME;

export interface DispatchPromptPayloadOptions extends TrackedBranchPayloadOptions {
	slotClient?: SlotClient;
}

export interface HandleHerdrSlotDispatchPromptOptions {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotDispatchPrompt(
	options: HandleHerdrSlotDispatchPromptOptions,
): Promise<void> {
	const prompt = options.args.trim();
	if (prompt.length === 0) {
		options.ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}
	options.notifyProgress("Generating branch name…");
	await options.ctx.waitForIdle();
	const branch = await createTrackedBranchForPrompt(options.pi, options.ctx.cwd, prompt);
	if ("error" in branch) {
		options.ctx.ui.notify(branch.error, "error");
		return;
	}
	options.notifyProgress("Storing dispatch prompt in Branch Memory…");
	const stored = await storeTrackedBranchPayload({
		pi: options.pi,
		cwd: options.ctx.cwd,
		branchName: branch.branchName,
		content: buildTrackedBranchLaunchPrompt(prompt),
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
		description: `herdr dispatch-prompt from ${branch.parentBranch}`,
		slotClient: options.slotClient ?? createHerdrSlotClient({ cwd: options.ctx.cwd }),
		notify: (message, level) => options.ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened Herdr workspace: ${target.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				`Entry Locator: ${stored.value.refName}`,
			].join("\n"),
		notifyProgress: options.notifyProgress,
	});
}

export const resolveDispatchPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
