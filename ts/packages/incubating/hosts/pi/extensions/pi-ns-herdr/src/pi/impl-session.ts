import { buildPiModelThinkingArgs, getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import type {
	CommandContext,
	CustomEntryLike,
	EntryRenderComponent,
	EntryRenderTheme,
} from "@nseng-ai/extension-kit/pi-types";
import { createFoldableTextEntryComponent } from "@nseng-ai/pi-runtime/terminal/foldable-text-entry";
import { commandSucceeded, formatCommandDetails } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import {
	HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	HERDR_PROMPT_TAB_IMPL_COMMAND_NAME,
	HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
	HERDR_SESSION_TAB_IMPL_COMMAND_NAME,
} from "@nseng-ai/herdr/api";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
	type ImplPromptPayloadOptions,
} from "../core/impl-prompt.ts";
import {
	formatImplDestinationNoun,
	prepareImplDestination,
	type ImplDestination,
} from "../core/impl-destination.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

export const SESSION_IMPL_PROMPT_ENTRY_TYPE = "herdr-session-impl-prompt";

export const SESSION_PROMPT_ACTIONS = {
	implement: "Implement on a new branch in an isolated Slot",
	loadEditor: "Load into editor for review/edit",
	cancel: "Cancel",
} as const;

const SYSTEM_PROMPT = `Draft a directed, self-contained implementation prompt for another coding-agent session.

Use the source session context and the continuation focus below. The prompt must let a fresh agent implement the requested continuation without access to the source conversation. Capture the goal, relevant repository and branch state, decisions and constraints, work already completed, concrete file or symbol anchors, remaining steps, validation expectations, and material risks or unknowns. Distinguish verified facts from assumptions.

Treat the source checkout and its absolute filesystem paths as context only. Express repository file and symbol anchors as paths relative to the repository root, and do not direct the destination agent to edit an absolute source-worktree path. If an absolute non-repository path is materially necessary, identify it as external context rather than as the implementation checkout. A fresh destination session will execute from another Slot worktree and must use its destination cwd as authoritative, rebasing repository paths under that checkout.

Omit conversational filler. Do not use tools or perform implementation work. Return only the implementation prompt; do not wrap it in a slash command or a code fence.`;

export interface HerdrSessionImplRegistrationOptions extends ImplPromptPayloadOptions {
	slotClient?: SlotClient;
	generatePrompt?: typeof generateSessionImplementationPrompt;
	implementPrompt?: typeof handleHerdrSlotImplPrompt;
}

interface SessionImplConfig {
	readonly sessionCommandName: string;
	readonly promptCommandName: string;
	readonly destination: ImplDestination;
}

const SESSION_CONFIGS: readonly SessionImplConfig[] = [
	{
		sessionCommandName: HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
		promptCommandName: HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
		destination: "workspace",
	},
	{
		sessionCommandName: HERDR_SESSION_TAB_IMPL_COMMAND_NAME,
		promptCommandName: HERDR_PROMPT_TAB_IMPL_COMMAND_NAME,
		destination: "tab",
	},
];

export function registerHerdrSessionImplCommands(
	context: HerdrPiContext,
	options: HerdrSessionImplRegistrationOptions = {},
): void {
	const payloadOptions = resolveImplPromptPayloadOptions(options);
	const generatePrompt = options.generatePrompt ?? generateSessionImplementationPrompt;
	const implementPrompt = options.implementPrompt ?? handleHerdrSlotImplPrompt;
	let generationPending = false;

	context.commands.registerEntryRenderer(
		SESSION_IMPL_PROMPT_ENTRY_TYPE,
		renderSessionImplPromptEntry,
	);

	for (const config of SESSION_CONFIGS) {
		registerCommandWithImmediateAck({
			host: context.commands,
			commandName: config.sessionCommandName,
			commandDefinition: {
				description: `Implement the current session in a new ${formatImplDestinationNoun(config.destination)} without copying its prompt through this session.`,
				argumentHint: "[focus]",
				handler: async (args, pi) => {
					if (generationPending) {
						pi.ui.notify("A session implementation prompt is already being prepared.", "warning");
						return;
					}
					// Acquire the shared generation guard before any asynchronous work
					// (including caller-workspace preflight) so overlapping invocations
					// cannot both pass the check above and race prompt generation.
					generationPending = true;
					try {
						const preparedDestination = await prepareImplDestination({
							destination: config.destination,
							commandName: config.sessionCommandName,
							herdr: context.herdr,
						});
						if (preparedDestination.type === "failed") {
							pi.ui.notify(preparedDestination.message, "error");
							return;
						}
						await pi.waitForIdle();
						setPromptCreationMessage(pi, config.sessionCommandName, "preparing prompt…");
						const generated = await generatePrompt(context.commands, pi, args.trim());
						if (!generated.ok) {
							pi.ui.notify(generated.message, "error");
							return;
						}
						context.commands.appendEntry(SESSION_IMPL_PROMPT_ENTRY_TYPE, {
							prompt: generated.prompt,
						});
						const action = await selectSessionPromptAction(pi);
						if (action === "unavailable") return;
						if (action === "cancelled") {
							pi.ui.notify("Session implementation cancelled.", "info");
							return;
						}
						if (action === "loadEditor") {
							if (pi.ui.setEditorText === undefined) {
								pi.ui.notify("This Pi runtime cannot load the prompt into the editor.", "error");
								return;
							}
							pi.ui.setEditorText(`/${config.promptCommandName} ${generated.prompt}`);
							pi.ui.notify("Loaded the implementation prompt into the editor for review.", "info");
							return;
						}

						const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
						await implementPrompt(createHerdrPiCommandContext(context, pi), {
							payloadOptions,
							...optionalEntry("slotClient", options.slotClient),
							args: generated.prompt,
							commandName: config.sessionCommandName,
							destination: preparedDestination.destination,
							notifyProgress,
						});
					} finally {
						generationPending = false;
						setPromptCreationMessage(pi, config.sessionCommandName, undefined);
					}
				},
			},
			options: { delivery: "message" },
		});
	}
}

function setPromptCreationMessage(
	pi: CommandContext,
	commandName: string,
	message: string | undefined,
): void {
	if (pi.ui.setWidget !== undefined) {
		pi.ui.setWidget(commandName, message === undefined ? undefined : [message]);
		return;
	}
	pi.ui.setStatus?.(commandName, message);
}

export function renderSessionImplPromptEntry(
	entry: CustomEntryLike,
	_options: { expanded: boolean },
	theme: EntryRenderTheme,
): EntryRenderComponent {
	const data = entry.data as { prompt?: unknown } | undefined;
	const prompt = typeof data?.prompt === "string" ? data.prompt : "";
	const lines = prompt.split("\n");
	return createFoldableTextEntryComponent({
		title: `session implementation prompt (${lines.length} lines)`,
		lines,
		expanded: true,
		previewLineLimit: lines.length,
		gutter: "▌ ",
		theme,
	});
}

async function selectSessionPromptAction(
	pi: CommandContext,
): Promise<"implement" | "loadEditor" | "cancelled" | "unavailable"> {
	if (pi.ui.select === undefined) {
		pi.ui.notify("This Pi runtime cannot present the session implementation menu.", "error");
		return "unavailable";
	}
	pi.ui.notify(
		[
			`Source checkout: ${pi.cwd}`,
			"Execution checkout: new branch in an isolated Slot",
			"Branch basis: selected after approval",
		].join("\n"),
		"info",
	);
	const selection = await pi.ui.select("Session implementation prompt ready", [
		SESSION_PROMPT_ACTIONS.implement,
		SESSION_PROMPT_ACTIONS.loadEditor,
		SESSION_PROMPT_ACTIONS.cancel,
	]);
	if (selection === SESSION_PROMPT_ACTIONS.implement) return "implement";
	if (selection === SESSION_PROMPT_ACTIONS.loadEditor) return "loadEditor";
	return "cancelled";
}

export type SessionImplementationPromptResult =
	| { ok: true; prompt: string }
	| { ok: false; message: string };

export async function generateSessionImplementationPrompt(
	commands: HerdrPiContext["commands"],
	pi: CommandContext,
	focus: string,
): Promise<SessionImplementationPromptResult> {
	const sessionFile = pi.sessionManager.getSessionFile();
	if (sessionFile === undefined) {
		return {
			ok: false,
			message:
				"The current Pi session is not persisted, so an implementation prompt cannot be generated from it.",
		};
	}
	const request = buildSummaryRequest(focus);
	const launchOptions = getPiLaunchOptions(commands, pi);
	const args = [
		"--fork",
		sessionFile,
		...buildPiModelThinkingArgs(launchOptions),
		"--no-tools",
		"--print",
		request,
	];

	const result = await commands.exec("pi", args, { cwd: pi.cwd, timeout: 120_000 });
	if (!commandSucceeded(result)) {
		return {
			ok: false,
			message: `Could not prepare the session implementation prompt (${formatCommandDetails(result)}).`,
		};
	}
	const prompt = result.stdout.replace(/\r?\n$/, "");
	if (prompt.trim() === "") {
		return { ok: false, message: "The session prompt generator returned no content." };
	}
	return { ok: true, prompt };
}

export function buildSummaryRequest(focus: string): string {
	const normalizedFocus = focus.trim();
	return [
		SYSTEM_PROMPT,
		"",
		"## Continuation focus",
		normalizedFocus === ""
			? "Choose the most natural implementation continuation from the session."
			: normalizedFocus,
	].join("\n");
}
