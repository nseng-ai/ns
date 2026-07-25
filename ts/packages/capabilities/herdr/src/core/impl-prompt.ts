import {
	buildTrackedBranchImplPrompt,
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

import { HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME } from "./command-surfaces.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import { resolveImplBranchBasis } from "./impl-branch-basis.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { launchPreparedBranch } from "./prepared-launch.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";

type ImplPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;
const COMMAND_NAME = HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME;

export interface ImplPromptPayloadOptions extends TrackedBranchPayloadOptions {
	slotClient?: SlotClient;
	graphite?: Pick<GraphiteBranchGateway, "trunkBranch">;
	git?: Pick<GitGateway, "createBranchAtStartPoint" | "currentBranch">;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export interface HerdrImplPromptContext {
	commands: ImplPromptRuntime;
	pi: CommandContext;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "createBranchAtStartPoint" | "currentBranch">;
	herdr: HerdrGateway;
}

export interface HandleHerdrSlotImplPromptOptions {
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
	args: string;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotImplPrompt(
	context: HerdrImplPromptContext,
	options: HandleHerdrSlotImplPromptOptions,
): Promise<void> {
	const prompt = options.args.trim();
	if (prompt.length === 0) {
		context.pi.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}
	await context.pi.waitForIdle();
	const selection = await resolveImplBranchBasis({
		cwd: context.pi.cwd,
		git: context.git,
		interaction: context.pi,
	});
	if (selection.type === "cancelled") {
		context.pi.ui.notify("Herdr implementation cancelled.", "info");
		return;
	}
	if (selection.type === "failed") {
		context.pi.ui.notify(selection.message, "error");
		return;
	}

	const branch =
		selection.basis === "current"
			? await createCurrentPromptBranch(context, options, prompt, selection.currentBranch)
			: await createTrunkPromptBranch(context, options, prompt);
	if ("error" in branch) {
		context.pi.ui.notify(branch.error, "error");
		return;
	}
	await implTrackedBranchPrompt(context, {
		branch,
		content: buildTrackedBranchImplPrompt(
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
	context: HerdrImplPromptContext,
	options: HandleHerdrSlotImplPromptOptions,
	prompt: string,
	selectedBranch: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	const revalidated = await context.git.currentBranch({ cwd: context.pi.cwd });
	if (revalidated.type !== "branch" || revalidated.branch !== selectedBranch) {
		return {
			error: `Current branch changed after selection; expected ${selectedBranch}. No branch was created.`,
		};
	}
	options.notifyProgress("Generating branch name…");
	return createTrackedBranchForPrompt(
		{ pi: context.commands, git: context.git },
		{ cwd: context.pi.cwd, prompt },
	);
}

async function createTrunkPromptBranch(
	context: HerdrImplPromptContext,
	options: HandleHerdrSlotImplPromptOptions,
	prompt: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	return createTrackedBranchFromLocalTrunkForPrompt(
		{ pi: context.commands, graphite: context.graphite, git: context.git },
		{
			cwd: context.pi.cwd,
			prompt,
			notify: options.notifyProgress,
			...optionalEntry("metadataDbAccess", options.metadataDbAccess),
		},
	);
}

/** Per-flow wording differences in the Herdr implementation success message. */
export interface HerdrTrackedBranchImplSuccessDetails {
	parentLabel: "Parent" | "Parent (trunk)";
	entryLocator: "include" | "omit";
}

/**
 * Herdr-owned tracked-branch implementation sequence shared by current-branch and
 * local-trunk prompt implementation: store the payload in Branch Memory
 * (refusing collisions), then open the branch in a new Herdr workspace.
 */
export async function implTrackedBranchPrompt(
	context: HerdrImplPromptContext,
	options: {
		branch: TrackedBranchEvidence;
		content: string;
		successDetails: HerdrTrackedBranchImplSuccessDetails;
		payloadOptions: ResolvedTrackedBranchPayloadOptions;
		slotClient?: SlotClient;
		notifyProgress: (message: string) => void;
	},
): Promise<void> {
	options.notifyProgress("Storing implementation prompt in Branch Memory…");
	const stored = await storeTrackedBranchPayload(
		{ pi: context.commands },
		{
			cwd: context.pi.cwd,
			branchName: options.branch.branchName,
			content: options.content,
			payloadOptions: options.payloadOptions,
		},
	);
	if (!stored.ok) {
		context.pi.ui.notify(
			formatTrackedBranchPayloadStorageFailure(
				options.branch.branchName,
				stored.error,
				"Herdr workspace",
			),
			"error",
		);
		return;
	}
	const result = await launchPreparedBranch(
		{
			herdr: context.herdr,
			slotClient: options.slotClient ?? createHerdrSlotClient({ cwd: context.pi.cwd }),
			notify: (message, level) => context.pi.ui.notify(message, level),
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
					getPiLaunchOptions(context.commands, context.pi),
				),
			},
			destination: { type: "workspace" },
		},
	);
	if (result.type === "opened") {
		context.pi.ui.notify(
			[
				`Opened Herdr workspace: ${result.target.checkout.branchName}`,
				`${options.successDetails.parentLabel}: ${options.branch.parentBranch}`,
				`Start point: ${options.branch.startPoint}`,
				`Implementation payload: ${stored.value.namespace}/${stored.value.key}`,
				...(options.successDetails.entryLocator === "include"
					? [`Entry Locator: ${stored.value.refName}`]
					: []),
			].join("\n"),
			"info",
		);
	}
}

export const resolveImplPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
