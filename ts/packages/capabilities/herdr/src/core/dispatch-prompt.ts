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
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SPACE_PROMPT_DISPATCH_COMMAND_NAME } from "./command-surfaces.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";

type DispatchPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = HERDR_SPACE_PROMPT_DISPATCH_COMMAND_NAME;

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
	await dispatchTrackedBranchPrompt({
		pi: options.pi,
		herdr: options.herdr,
		ctx: options.ctx,
		branch,
		content: buildTrackedBranchLaunchPrompt(prompt),
		description: `herdr dispatch-prompt from ${branch.parentBranch}`,
		successDetails: { parentLabel: "Parent", entryLocator: "include" },
		payloadOptions: options.payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

/** Per-flow wording differences in the Herdr dispatch success message. */
export interface HerdrTrackedBranchDispatchSuccessDetails {
	parentLabel: "Parent" | "Parent (trunk)";
	entryLocator: "include" | "omit";
}

/**
 * Herdr-owned tracked-branch dispatch sequence shared by prompt and trunk
 * dispatch: store the payload in Branch Memory (refusing collisions), then
 * open the branch in a new Herdr workspace with the Pi launch command.
 */
export async function dispatchTrackedBranchPrompt(options: {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	ctx: CommandContext;
	branch: TrackedBranchEvidence;
	content: string;
	description: string;
	successDetails: HerdrTrackedBranchDispatchSuccessDetails;
	workspaceLabel?: (worktreePath: string) => string;
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
				"Herdr workspace",
			),
			"error",
		);
		return;
	}
	const workspaceLabel = options.workspaceLabel;
	await openBranchInHerdrWorkspace({
		pi: options.pi,
		herdr: options.herdr,
		cwd: options.ctx.cwd,
		branchName: options.branch.branchName,
		command: buildTrackedBranchPayloadLaunchCommand(
			options.branch.branchName,
			getPiLaunchOptions(options.pi, options.ctx),
		),
		description: options.description,
		...(workspaceLabel === undefined
			? {}
			: { workspaceLabel: (target) => workspaceLabel(target.worktreePath) }),
		slotClient: options.slotClient ?? createHerdrSlotClient({ cwd: options.ctx.cwd }),
		notify: (message, level) => options.ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened Herdr workspace: ${target.branchName}`,
				`${options.successDetails.parentLabel}: ${options.branch.parentBranch}`,
				`Start point: ${options.branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				...(options.successDetails.entryLocator === "include"
					? [`Entry Locator: ${stored.value.refName}`]
					: []),
			].join("\n"),
		notifyProgress: options.notifyProgress,
	});
}

export const resolveDispatchPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
