import {
	createHerdrSlotClient,
	launchPreparedBranch,
	type HerdrGateway,
	type PreparedLaunchDestination,
} from "@nseng-ai/herdr/api";
import {
	buildTrackedBranchImplPrompt,
	createTrackedBranchForPrompt,
	createTrackedBranchFromLocalTrunkForPrompt,
	formatTrackedBranchPayloadStorageFailure,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	LOCAL_TRUNK_DISPATCH_CONTEXT_NOTE,
	type ResolvedTrackedBranchPayloadOptions,
	type TrackedBranchEvidence,
	type TrackedBranchPayloadOptions,
} from "@nseng-ai/extension-kit/tracked-branch-payload";
import { getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { SlotClient } from "@nseng-ai/slots/api";

import { buildHerdrImplPromptLaunchCommand } from "./impl-prompt-launch.ts";
import { resolveImplBranchBasis } from "./impl-branch-basis.ts";
import { formatImplDestinationNoun } from "./impl-destination.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { resolveRepoTrunkBranch } from "./trunk-branch.ts";

type ImplPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;

type ImplPromptGitGateway = Pick<
	GitGateway,
	| "cachedOriginHeadBranch"
	| "createBranchAtStartPoint"
	| "currentBranch"
	| "headCommit"
	| "optionalRepoRoot"
>;

export interface ImplPromptPayloadOptions extends TrackedBranchPayloadOptions {
	slotClient?: SlotClient;
	git?: ImplPromptGitGateway;
}

export interface HerdrImplPromptContext {
	commands: ImplPromptRuntime;
	pi: CommandContext;
	git: ImplPromptGitGateway;
	projectConfig: ProjectConfigGateway;
	herdr: HerdrGateway;
}

export interface HandleHerdrSlotImplPromptOptions {
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
	slotClient?: SlotClient;
	args: string;
	commandName: string;
	destination: PreparedLaunchDestination;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotImplPrompt(
	context: HerdrImplPromptContext,
	options: HandleHerdrSlotImplPromptOptions,
): Promise<void> {
	const prompt = options.args.trim();
	if (prompt.length === 0) {
		context.pi.ui.notify(`Usage: /${options.commandName} <prompt>`, "error");
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
		destination: options.destination,
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
		{ pi: context.commands, git: context.git, projectConfig: context.projectConfig },
		{ cwd: context.pi.cwd, prompt },
	);
}

async function createTrunkPromptBranch(
	context: HerdrImplPromptContext,
	options: HandleHerdrSlotImplPromptOptions,
	prompt: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	const resolution = await resolveRepoTrunkBranch(context.git, { cwd: context.pi.cwd });
	if (resolution.type === "failed") return { error: resolution.message };
	return createTrackedBranchFromLocalTrunkForPrompt(
		{
			pi: context.commands,
			trunkBranch: resolution.branch,
			git: context.git,
			projectConfig: context.projectConfig,
		},
		{
			cwd: context.pi.cwd,
			prompt,
			notify: options.notifyProgress,
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
 * (refusing collisions), then open the branch in the prepared Herdr destination.
 */
export async function implTrackedBranchPrompt(
	context: HerdrImplPromptContext,
	options: {
		branch: TrackedBranchEvidence;
		content: string;
		successDetails: HerdrTrackedBranchImplSuccessDetails;
		payloadOptions: ResolvedTrackedBranchPayloadOptions;
		slotClient?: SlotClient;
		destination: PreparedLaunchDestination;
		notifyProgress: (message: string) => void;
	},
): Promise<void> {
	options.notifyProgress("Storing implementation prompt in Branch Memory…");
	const stored = await storeTrackedBranchPayload(context.commands, {
		cwd: context.pi.cwd,
		branchName: options.branch.branchName,
		content: options.content,
		payloadOptions: options.payloadOptions,
	});
	if (!stored.ok) {
		context.pi.ui.notify(
			formatTrackedBranchPayloadStorageFailure(
				options.branch.branchName,
				stored.error,
				`Herdr ${formatImplDestinationNoun(options.destination.type)}`,
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
				launchCommand: buildHerdrImplPromptLaunchCommand(
					options.branch.branchName,
					getPiLaunchOptions(context.commands, context.pi),
				),
			},
			destination: options.destination,
		},
	);
	if (result.type === "opened") {
		context.pi.ui.notify(
			[
				`Opened Herdr ${formatImplDestinationNoun(result.destination)}: ${result.target.checkout.branchName}`,
				`Destination worktree: ${result.target.checkout.worktreePath}`,
				`${options.successDetails.parentLabel}: ${options.branch.parentBranch}`,
				`Start point: ${options.branch.startPoint}`,
				`Implementation payload: ${stored.value.namespace}/${stored.value.key}`,
				`Prompt: ${Buffer.byteLength(options.content, "utf8")} UTF-8 bytes`,
				...(options.successDetails.entryLocator === "include"
					? [`Entry Locator: ${stored.value.refName}`]
					: []),
			].join("\n"),
			"info",
		);
	}
}

export const resolveImplPromptPayloadOptions = resolveTrackedBranchPayloadOptions;
