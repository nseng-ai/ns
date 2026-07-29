import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";

import { HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME } from "./command-surfaces.ts";

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
}

export interface HerdrImplSessionContext {
	readonly pi: CommandContext;
	readonly sessionContinuation: HerdrSessionContinuationGateway;
}

export interface HandleHerdrImplSessionOptions {
	readonly args: string;
	readonly composePrompt: (request: {
		readonly cwd: string;
		readonly activeContextText: string;
		readonly steeringFocus?: string;
	}) => Promise<
		| { readonly ok: true; readonly prompt: string }
		| { readonly ok: false; readonly message: string }
	>;
	readonly notifyProgress: (message: string) => void;
}

/**
 * Composes a directed implementation prompt from the caller's active session and fills the
 * input box with a ready-to-review `/ns:herdr:impl:prompt:space <prompt>` command. Nothing is
 * submitted or mutated: the user reviews, edits, and sends the composed command, and the prompt
 * implementation workflow owns branch, Slot, payload, and Herdr space creation from there.
 */
export async function handleHerdrImplSession(
	context: HerdrImplSessionContext,
	options: HandleHerdrImplSessionOptions,
): Promise<void> {
	await context.pi.waitForIdle();

	const sourceSessionFile = context.pi.sessionManager.getSessionFile();
	if (sourceSessionFile === undefined || sourceSessionFile.trim().length === 0) {
		context.pi.ui.notify(
			"Session implementation requires a persisted caller Pi session. No prompt was composed.",
			"error",
		);
		return;
	}
	const sourceLeafId = context.pi.sessionManager.getLeafId();
	if (sourceLeafId === null || sourceLeafId.trim().length === 0) {
		context.pi.ui.notify(
			"Session implementation requires a non-empty active conversation path with an authoritative leaf id. No prompt was composed.",
			"error",
		);
		return;
	}

	const sourcePreflight = context.sessionContinuation.preflightSource({
		sourceSessionFile,
		sourceLeafId,
	});
	if (!sourcePreflight.ok) {
		context.pi.ui.notify(`${sourcePreflight.message} No prompt was composed.`, "error");
		return;
	}

	const contextText = context.sessionContinuation.buildContextText({
		sourceSessionFile,
		sourceLeafId,
	});
	if (!contextText.ok || contextText.text.trim().length === 0) {
		context.pi.ui.notify(
			contextText.ok
				? "Could not compose an implementation prompt because the active compaction-aware conversation context is empty."
				: contextText.message,
			"error",
		);
		return;
	}

	const steeringFocus = options.args.trim();
	options.notifyProgress("Summarizing the active session into an implementation prompt…");
	const composed = await options.composePrompt({
		cwd: context.pi.cwd,
		activeContextText: contextText.text,
		...(steeringFocus.length === 0 ? {} : { steeringFocus }),
	});
	if (!composed.ok) {
		context.pi.ui.notify(composed.message, "error");
		return;
	}
	// The composed command must stay a single editor line so command dispatch receives the
	// whole prompt as arguments; the model is instructed to emit one paragraph, and this
	// normalization enforces it against drift.
	const prompt = composed.prompt.replace(/\s+/g, " ").trim();
	if (prompt.length === 0) {
		context.pi.ui.notify("The session summarization model returned empty output.", "error");
		return;
	}

	const composedCommand = `/${HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME} ${prompt}`;
	if (context.pi.ui.setEditorText === undefined) {
		context.pi.ui.notify(
			`Composed the implementation command, but this session has no editable input box. Run it manually:\n${composedCommand}`,
			"info",
		);
		return;
	}
	context.pi.ui.setEditorText(composedCommand);
	context.pi.ui.notify(
		"Filled the input box with a composed /ns:herdr:impl:prompt:space command. Review or edit it, then send it to launch the implementation space.",
		"info",
	);
}

export function buildSessionContinuationPrompt(request: {
	readonly activeContextText: string;
	readonly steeringFocus?: string;
}): string {
	return [
		"Compose one directed implementation prompt for continuing the active coding session below in a fresh implementation session.",
		"The implementing agent will see only your prompt, never this conversation: make it self-contained, naming the concrete goal, the relevant files or systems, decisions already made, and the immediate next steps.",
		"Return plain text only, as one single paragraph with no line breaks: no preamble, heading, list, slug, Markdown plan, or Handoff Artifact.",
		...(request.steeringFocus === undefined
			? []
			: ["", "Steer the prompt toward this focus:", request.steeringFocus]),
		"",
		"<active-session-context>",
		request.activeContextText,
		"</active-session-context>",
	].join("\n");
}
