import {
	createTrackedBranchForPrompt,
	createTrackedBranchFromLocalTrunkForPrompt,
	type TrackedBranchEvidence,
} from "@nseng-ai/extension-kit/tracked-branch-payload";
import { buildPiSessionLaunchCommand, getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { SlotClient } from "@nseng-ai/slots/api";

import type { HerdrGateway } from "./herdr-gateway.ts";
import { resolveImplBranchBasis } from "./impl-branch-basis.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { launchPreparedBranch } from "./prepared-launch.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";

export interface DestinationSessionEvidence {
	readonly sessionFile: string;
	readonly sessionId: string;
}

export type SessionContinuationResult =
	| { readonly ok: true; readonly value: DestinationSessionEvidence }
	| {
			readonly ok: false;
			readonly error: {
				readonly message: string;
				readonly recoverableDestination?: DestinationSessionEvidence;
			};
	  };

export interface HerdrSessionContinuationGateway {
	cloneActiveSessionForImplementation(request: {
		readonly sourceSessionFile: string;
		readonly sourceLeafId: string;
		readonly destinationCwd: string;
		readonly continuationMessage: string;
	}): Promise<SessionContinuationResult>;
}

export interface HerdrImplSessionContext {
	readonly commands: HerdrPiCommandApi;
	readonly pi: CommandContext;
	readonly trunkBranch: string;
	readonly git: Pick<
		GitGateway,
		"createBranchAtStartPoint" | "currentBranch" | "headCommit" | "repoRoot"
	>;
	readonly herdr: HerdrGateway;
	readonly sessionContinuation: HerdrSessionContinuationGateway;
}

export interface HandleHerdrImplSessionOptions {
	readonly args: string;
	readonly preflightActiveSessionSource: (request: {
		readonly sourceSessionFile: string;
		readonly sourceLeafId: string;
	}) => { readonly ok: true } | { readonly ok: false; readonly message: string };
	readonly buildActiveContextText: (request: {
		readonly sourceSessionFile: string;
		readonly sourceLeafId: string;
	}) =>
		| { readonly ok: true; readonly text: string }
		| { readonly ok: false; readonly message: string };
	readonly deriveFocus: (request: {
		readonly cwd: string;
		readonly activeContextText: string;
	}) => Promise<
		{ readonly ok: true; readonly focus: string } | { readonly ok: false; readonly message: string }
	>;
	readonly notifyProgress: (message: string) => void;
	readonly slotClient?: SlotClient;
}

export async function handleHerdrImplSession(
	context: HerdrImplSessionContext,
	options: HandleHerdrImplSessionOptions,
): Promise<void> {
	await context.pi.waitForIdle();

	const sourceSessionFile = context.pi.sessionManager.getSessionFile();
	if (sourceSessionFile === undefined || sourceSessionFile.trim().length === 0) {
		context.pi.ui.notify(
			"Session implementation requires a persisted caller Pi session. No branch, Slot, destination session, or Herdr space was created.",
			"error",
		);
		return;
	}
	const activeBranch = context.pi.sessionManager.getBranch();
	const sourceLeafId = resolveSourceLeafId(context.pi, activeBranch);
	if (activeBranch.length === 0 || sourceLeafId === undefined) {
		context.pi.ui.notify(
			"Session implementation requires a non-empty active conversation path with an authoritative leaf id. No mutation was performed.",
			"error",
		);
		return;
	}

	const sourcePreflight = options.preflightActiveSessionSource({
		sourceSessionFile,
		sourceLeafId,
	});
	if (!sourcePreflight.ok) {
		context.pi.ui.notify(
			`${sourcePreflight.message} No branch, Slot, destination session, or Herdr space was created.`,
			"error",
		);
		return;
	}

	const suppliedFocus = options.args.trim();
	let focus = suppliedFocus;
	if (focus.length === 0) {
		const contextText = options.buildActiveContextText({ sourceSessionFile, sourceLeafId });
		if (!contextText.ok || contextText.text.trim().length === 0) {
			context.pi.ui.notify(
				contextText.ok
					? "Could not derive continuation focus because the active compaction-aware conversation context is empty."
					: contextText.message,
				"error",
			);
			return;
		}
		options.notifyProgress("Deriving continuation focus from the active session…");
		const derived = await options.deriveFocus({
			cwd: context.pi.cwd,
			activeContextText: contextText.text,
		});
		if (!derived.ok) {
			context.pi.ui.notify(derived.message, "error");
			return;
		}
		focus = derived.focus.trim();
		if (focus.length === 0) {
			context.pi.ui.notify("The continuation-focus model returned empty output.", "error");
			return;
		}
	}

	const selection = await resolveImplBranchBasis({
		cwd: context.pi.cwd,
		git: context.git,
		interaction: context.pi,
	});
	if (selection.type === "cancelled") {
		context.pi.ui.notify("Herdr session implementation cancelled.", "info");
		return;
	}
	if (selection.type === "failed") {
		context.pi.ui.notify(selection.message, "error");
		return;
	}

	const branch =
		selection.basis === "current"
			? await createCurrentSessionBranch(context, options, focus, selection.currentBranch)
			: await createTrunkSessionBranch(context, options, focus);
	if ("error" in branch) {
		context.pi.ui.notify(branch.error, "error");
		return;
	}

	const continuationMessage = buildSessionContinuationTurn(focus);
	const result = await launchPreparedBranch<DestinationSessionEvidence>(
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
				branchName: branch.branchName,
				prepareAfterCheckout: async (target) => {
					const cloned = await context.sessionContinuation.cloneActiveSessionForImplementation({
						sourceSessionFile,
						sourceLeafId,
						destinationCwd: target.worktreePath,
						continuationMessage,
					});
					if (!cloned.ok) {
						return {
							type: "failed",
							message: cloned.error.message,
							...(cloned.error.recoverableDestination === undefined
								? {}
								: { evidence: cloned.error.recoverableDestination }),
						};
					}
					return {
						type: "prepared",
						evidence: cloned.value,
						launchCommand: buildPiSessionLaunchCommand(
							cloned.value.sessionFile,
							getPiLaunchOptions(context.commands, context.pi),
						),
					};
				},
			},
			destination: { type: "workspace" },
		},
	);
	if (result.type === "opened" && result.preparationEvidence !== undefined) {
		context.pi.ui.notify(
			[
				"Opened active-session implementation in a new Herdr space.",
				`Branch: ${branch.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Worktree: ${result.target.checkout.worktreePath}`,
				`Destination session: ${result.preparationEvidence.sessionFile}`,
				`Workspace: ${result.target.workspaceId}`,
				`Tab: ${result.target.tabId}`,
				`Pane: ${result.target.paneId}`,
			].join("\n"),
			"info",
		);
		return;
	}
	if (result.type === "failed" && result.preparationEvidence !== undefined) {
		context.pi.ui.notify(
			`The Herdr destination failed after the destination session was persisted. Resume it with: ${result.preparationEvidence.sessionFile}`,
			"error",
		);
	}
}

export function buildSessionContinuationTurn(focus: string): string {
	return [
		"## Continuation focus",
		focus,
		"",
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!ns flow submit`.",
	].join("\n");
}

export function buildSessionContinuationFocusPrompt(activeContextText: string): string {
	return [
		"Derive one concise, actionable task for continuing the active coding session below.",
		"Return plain text only: no preamble, summary heading, slug, Markdown plan, or Handoff Artifact.",
		"Preserve the concrete implementation intent and immediate next work.",
		"",
		"<active-session-context>",
		activeContextText,
		"</active-session-context>",
	].join("\n");
}

function resolveSourceLeafId(
	pi: CommandContext,
	activeBranch: readonly { readonly [field: string]: unknown }[],
): string | undefined {
	const explicit = pi.sessionManager.getLeafId?.();
	if (explicit !== undefined && explicit !== null && explicit.trim().length > 0) return explicit;
	const id = activeBranch.at(-1)?.id;
	return typeof id === "string" && id.trim().length > 0 ? id : undefined;
}

async function createCurrentSessionBranch(
	context: HerdrImplSessionContext,
	options: HandleHerdrImplSessionOptions,
	focus: string,
	selectedBranch: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	const revalidated = await context.git.currentBranch({ cwd: context.pi.cwd });
	if (revalidated.type !== "branch" || revalidated.branch !== selectedBranch) {
		return {
			error: `Current branch changed after selection; expected ${selectedBranch}. No branch was created.`,
		};
	}
	options.notifyProgress("Generating implementation branch name…");
	return createTrackedBranchForPrompt(
		{ pi: context.commands, git: context.git },
		{ cwd: context.pi.cwd, prompt: focus },
	);
}

async function createTrunkSessionBranch(
	context: HerdrImplSessionContext,
	options: HandleHerdrImplSessionOptions,
	focus: string,
): Promise<TrackedBranchEvidence | { error: string }> {
	return createTrackedBranchFromLocalTrunkForPrompt(
		{ pi: context.commands, trunkBranch: context.trunkBranch, git: context.git },
		{ cwd: context.pi.cwd, prompt: focus, notify: options.notifyProgress },
	);
}
