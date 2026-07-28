import { IMPL_COMPLETION_INSTRUCTIONS_LINES } from "@nseng-ai/extension-kit/tracked-branch-payload";
import { buildPiSessionLaunchCommand, getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { SlotClient } from "@nseng-ai/slots/api";

import type { HerdrGateway } from "./herdr-gateway.ts";
import { createTrackedBranchForBasis, resolveImplBranchBasis } from "./impl-branch-basis.ts";
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
	preflightSource(request: {
		readonly sourceSessionFile: string;
		readonly sourceLeafId: string;
	}): { readonly ok: true } | { readonly ok: false; readonly message: string };
	buildContextText(request: {
		readonly sourceSessionFile: string;
		readonly sourceLeafId: string;
	}):
		| { readonly ok: true; readonly text: string }
		| { readonly ok: false; readonly message: string };
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
	const sourceLeafId = context.pi.sessionManager.getLeafId();
	if (sourceLeafId === null || sourceLeafId.trim().length === 0) {
		context.pi.ui.notify(
			"Session implementation requires a non-empty active conversation path with an authoritative leaf id. No mutation was performed.",
			"error",
		);
		return;
	}

	const sourcePreflight = context.sessionContinuation.preflightSource({
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
		const contextText = context.sessionContinuation.buildContextText({
			sourceSessionFile,
			sourceLeafId,
		});
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

	const branch = await createTrackedBranchForBasis(
		{ pi: context.commands, trunkBranch: context.trunkBranch, git: context.git },
		{
			cwd: context.pi.cwd,
			prompt: focus,
			selection,
			notifyProgress: options.notifyProgress,
		},
	);
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
	return ["## Continuation focus", focus, "", ...IMPL_COMPLETION_INSTRUCTIONS_LINES].join("\n");
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
