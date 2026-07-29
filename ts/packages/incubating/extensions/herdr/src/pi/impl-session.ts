import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PiSessionEntry } from "@nseng-ai/extension-kit/pi-types";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SESSION_SPACE_IMPL_COMMAND_NAME } from "../core/command-surfaces.ts";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
	type ImplPromptPayloadOptions,
} from "../core/impl-prompt.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

const COMMAND_NAME = HERDR_SESSION_SPACE_IMPL_COMMAND_NAME;
const PRIVATE_GENERATION_TIMEOUT_MS = 10 * 60 * 1_000;

const SYSTEM_PROMPT = `Draft a directed, self-contained implementation prompt for another coding-agent session.

Use the supplied active-session branch entries and continuation focus. The prompt must let a fresh agent implement the requested continuation without access to the parent session. Capture the goal, relevant repository and branch state, decisions and constraints, work already completed, concrete file or symbol anchors, remaining steps, validation expectations, and material risks or unknowns. Distinguish verified facts from assumptions. Omit conversational filler. Do not use tools or perform implementation work. Return only the implementation prompt; do not wrap it in a slash command or a code fence.`;

export interface PrivatePromptFileGateway {
	withUtf8Prompt<T>(content: string, useFile: (filePath: string) => Promise<T>): Promise<T>;
}

export interface PrivateSessionPromptGenerator {
	generate(options: {
		cwd: string;
		focus: string;
		branchEntries: readonly PiSessionEntry[];
		model?: { provider: string; id: string };
		thinking: string;
	}): Promise<{ ok: true; prompt: string } | { ok: false; message: string }>;
}

export interface HerdrSessionSpaceImplRegistrationOptions extends ImplPromptPayloadOptions {
	generator?: PrivateSessionPromptGenerator;
	slotClient?: SlotClient;
}

export function registerHerdrSessionSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrSessionSpaceImplRegistrationOptions = {},
): void {
	const payloadOptions = resolveImplPromptPayloadOptions(options);
	const generator = options.generator ?? createPrivateSessionPromptGenerator(context.commands);

	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Privately derive and implement the current session in a new space.",
			argumentHint: "[focus]",
			handler: async (args, pi) => {
				await pi.waitForIdle();
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				notifyProgress("Preparing private implementation prompt…");
				const generated = await generator.generate({
					cwd: pi.cwd,
					focus: args.trim(),
					branchEntries: pi.sessionManager.getBranch(),
					...(pi.model === undefined ? {} : { model: pi.model }),
					thinking: context.commands.getThinkingLevel(),
				});
				if (!generated.ok) {
					pi.ui.notify(
						`Could not prepare the private implementation prompt. ${generated.message}`,
						"error",
					);
					return;
				}
				if (generated.prompt.trim() === "") {
					pi.ui.notify("Private prompt generation returned no implementation prompt.", "error");
					return;
				}
				notifyProgress(
					`Prepared private implementation prompt (${generated.prompt.length} characters).`,
				);
				await handleHerdrSlotImplPrompt(createHerdrPiCommandContext(context, pi), {
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					args: generated.prompt,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

export function createPrivateSessionPromptGenerator(
	commands: Pick<HerdrPiCommandApi, "exec">,
	files: PrivatePromptFileGateway = nodePrivatePromptFileGateway,
): PrivateSessionPromptGenerator {
	return {
		async generate(options) {
			let request: string;
			try {
				request = buildPrivateGenerationRequest(options.focus, options.branchEntries);
			} catch (error) {
				return { ok: false, message: formatErrorMessage(error) };
			}
			try {
				return await files.withUtf8Prompt(request, async (filePath) => {
					const args = [
						"--print",
						"--no-session",
						"--no-tools",
						...(options.model === undefined
							? []
							: ["--provider", options.model.provider, "--model", options.model.id]),
						...(options.thinking === "off" ? [] : ["--thinking", options.thinking]),
						`@${filePath}`,
					];
					const result = await commands.exec("pi", args, {
						cwd: options.cwd,
						timeout: PRIVATE_GENERATION_TIMEOUT_MS,
					});
					if (result.type !== "exited" || result.code !== 0) {
						return { ok: false, message: "The private model operation failed." };
					}
					return { ok: true, prompt: result.stdout };
				});
			} catch (error) {
				return { ok: false, message: formatErrorMessage(error) };
			}
		},
	};
}

function buildPrivateGenerationRequest(
	focus: string,
	branchEntries: readonly PiSessionEntry[],
): string {
	return [
		SYSTEM_PROMPT,
		"",
		"## Continuation focus",
		focus === "" ? "Choose the most natural implementation continuation from the session." : focus,
		"",
		"## Active session branch entries (JSON)",
		JSON.stringify(branchEntries, null, 2),
	].join("\n");
}

const nodePrivatePromptFileGateway: PrivatePromptFileGateway = {
	async withUtf8Prompt(content, useFile) {
		const directory = await mkdtemp(join(tmpdir(), "ns-herdr-session-prompt-"));
		const filePath = join(directory, "request.md");
		try {
			await writeFile(filePath, content, "utf8");
			return await useFile(filePath);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
};

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
