import {
	buildTrackedBranchLaunchPrompt,
	buildTrackedBranchPayloadLaunchCommand,
	createTrackedBranchForPrompt,
	createTrackedBranchFromLocalTrunkForPrompt,
	formatTrackedBranchPayloadStorageFailure,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	LOCAL_TRUNK_DISPATCH_CONTEXT_NOTE,
	type ResolvedTrackedBranchPayloadOptions,
	type TrackedBranchEvidence,
	type TrackedBranchPayloadOptions,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import { getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME } from "./command-surfaces.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import { resolveLaunchBranchBasis } from "./launch-branch-basis.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { dispatchPreparedBranch } from "./prepared-dispatch.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";

type DispatchPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME;

export interface DispatchPromptPayloadOptions extends TrackedBranchPayloadOptions {
	slotClient?: SlotClient;
	graphite?: Pick<GraphiteBranchGateway, "trunkBranch">;
	git?: Pick<GitGateway, "currentBranch">;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export interface HandleHerdrSlotDispatchPromptOptions {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "currentBranch">;
	metadataDbAccess?: GraphiteMetadataDbAccess;
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
	await options.ctx.waitForIdle();
	const selection = await resolveLaunchBranchBasis({
		cwd: options.ctx.cwd,
		git: options.git,
		interaction: options.ctx,
	});
	if (selection.type === "cancelled") {
		options.ctx.ui.notify("Herdr launch cancelled.", "info");
		return;
	}
	if (selection.type === "failed") {
		options.ctx.ui.notify(selection.message, "error");
		return;
	}

	const branch =
		selection.basis === "current"
			? await createCurrentPromptBranch(options, prompt, selection.currentBranch)
			: await createTrunkPromptBranch(options, prompt);
	if ("error" in branch) {
		options.ctx.ui.notify(branch.error, "error");
		return;
	}
	await dispatchTrackedBranchPrompt({
		pi: options.pi,
		herdr: options.herdr,
		ctx: options.ctx,
		branch,
		content: buildTrackedBranchLaunchPrompt(
			prompt,
			selection.basis === "trunk" ? LOCAL_TRUNK_DISPATCH_CONTEXT_NOTE : undefined,
		),
		successDetails:
			selection.basis === "trunk"
				? { parentLabel: "Parent (trunk)", entryLocator: "omit" }
				: { parentLabel: "Parent", entryLocator: "include" },
		payloadOptions: options.payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

async function createCurrentPromptBranch(
	options: HandleHerdrSlotDispatchPromptOptions,
	prompt: string,
	selectedBranch: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	const revalidated = await options.git.currentBranch({ cwd: options.ctx.cwd });
	if (revalidated.type !== "branch" || revalidated.branch !== selectedBranch) {
		return {
			error: `Current branch changed after selection; expected ${selectedBranch}. No branch was created.`,
		};
	}
	options.notifyProgress("Generating branch name…");
	return createTrackedBranchForPrompt(options.pi, options.ctx.cwd, prompt);
}

async function createTrunkPromptBranch(
	options: HandleHerdrSlotDispatchPromptOptions,
	prompt: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	return createTrackedBranchFromLocalTrunkForPrompt({
		pi: options.pi,
		cwd: options.ctx.cwd,
		prompt,
		graphite: options.graphite,
		notify: options.notifyProgress,
		...optionalEntry("metadataDbAccess", options.metadataDbAccess),
	});
}

/** Per-flow wording differences in the Herdr dispatch success message. */
export interface HerdrTrackedBranchDispatchSuccessDetails {
	parentLabel: "Parent" | "Parent (trunk)";
	entryLocator: "include" | "omit";
}

/**
 * Herdr-owned tracked-branch dispatch sequence shared by current-branch and
 * local-trunk prompt dispatch: store the payload in Branch Memory
 * (refusing collisions), then open the branch in a new Herdr workspace.
 */
export async function dispatchTrackedBranchPrompt(options: {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	ctx: CommandContext;
	branch: TrackedBranchEvidence;
	content: string;
	successDetails: HerdrTrackedBranchDispatchSuccessDetails;
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
	const result = await dispatchPreparedBranch(
		{
			herdr: options.herdr,
			slotClient: options.slotClient ?? createHerdrSlotClient({ cwd: options.ctx.cwd }),
			notify: (message, level) => options.ctx.ui.notify(message, level),
			onStatus: (message) => {
				if (message !== undefined) options.notifyProgress(message);
			},
		},
		{
			payload: {
				branchName: options.branch.branchName,
				semanticSlug: options.branch.semanticSlug,
				launchCommand: buildTrackedBranchPayloadLaunchCommand(
					options.branch.branchName,
					getPiLaunchOptions(options.pi, options.ctx),
				),
			},
			destination: { type: "workspace" },
		},
	);
	if (result.type === "opened") {
		options.ctx.ui.notify(
			[
				`Opened Herdr workspace: ${result.target.checkout.branchName}`,
				`${options.successDetails.parentLabel}: ${options.branch.parentBranch}`,
				`Start point: ${options.branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				...(options.successDetails.entryLocator === "include"
					? [`Entry Locator: ${stored.value.refName}`]
					: []),
			].join("\n"),
			"info",
		);
	}
}

export const resolveDispatchPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
