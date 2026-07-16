import {
	buildTrackedBranchLaunchPrompt,
	buildTrackedBranchPayloadLaunchCommand,
	createTrackedBranchForPrompt,
	formatTrackedBranchPayloadStorageFailure,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	type ResolvedTrackedBranchPayloadOptions,
	type TrackedBranchEvidence,
	type TrackedBranchPayloadOptions,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import { getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { SlotClient } from "@nseng-ai/slots/api";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";

import { CMUX_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME } from "./command-surfaces.ts";
import type { CccPiCommandApi } from "./pi-command-api.ts";
import { createCccSlotClient } from "./slot-checkout.ts";
import { openBranchInCmuxSlot } from "./slot.ts";

type DispatchPromptRuntime = CommandExecApi & Pick<CccPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = CMUX_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME;

export interface DispatchPromptPayloadOptions extends TrackedBranchPayloadOptions {
	slotClient?: SlotClient;
}

export interface HandleCccSlotDispatchPromptOptions {
	pi: DispatchPromptRuntime;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleCccSlotDispatchPrompt(
	options: HandleCccSlotDispatchPromptOptions,
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
	await dispatchTrackedBranchPrompt({
		pi: options.pi,
		ctx: options.ctx,
		branch,
		content: buildTrackedBranchLaunchPrompt(prompt),
		description: `dispatch-prompt from ${branch.parentBranch}`,
		payloadOptions: options.payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

export async function dispatchTrackedBranchPrompt(options: {
	pi: DispatchPromptRuntime;
	ctx: CommandContext;
	branch: TrackedBranchEvidence;
	content: string;
	description: string;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	options.notifyProgress("Storing dispatch prompt in Branch Memory…");
	const stored = await storeTrackedBranchPayload({
		pi: options.pi,
		cwd: options.ctx.cwd,
		branchName: options.branch.branchName,
		content: options.content,
		payloadOptions: options.payloadOptions,
	});
	if (!stored.ok) {
		options.ctx.ui.notify(
			formatTrackedBranchPayloadStorageFailure(
				options.branch.branchName,
				stored.error,
				"cmux workspace",
			),
			"error",
		);
		return;
	}
	await openBranchInCmuxSlot({
		pi: options.pi,
		cwd: options.ctx.cwd,
		branchName: options.branch.branchName,
		command: buildTrackedBranchPayloadLaunchCommand(
			options.branch.branchName,
			getPiLaunchOptions(options.pi, options.ctx),
		),
		description: options.description,
		slotClient: options.slotClient ?? createCccSlotClient({ cwd: options.ctx.cwd }),
		notify: (message, level) => options.ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened cmux workspace: ${target.branchName}`,
				`Parent: ${options.branch.parentBranch}`,
				`Start point: ${options.branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				`Entry Locator: ${stored.value.refName}`,
			].join("\n"),
	});
}

export const buildLaunchPrompt = buildTrackedBranchLaunchPrompt;
export const resolveDispatchPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
