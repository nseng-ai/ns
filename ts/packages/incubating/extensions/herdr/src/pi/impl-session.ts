import type { ModelRegistry } from "@nseng-ai/extension-kit/pi-types";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
import {
	callPiModelText,
	formatPiModelCallFailure,
	type PiModelRegistryLike,
} from "@nseng-ai/pi-runtime/models/call";

import {
	HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import type { HerdrPiContext } from "./context.ts";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";

const MAX_SESSION_CONTEXT_CHARS = 160_000;
const MAX_SUMMARY_TOKENS = 4_000;
const SYSTEM_PROMPT = `Create a directed, self-contained implementation summary for another coding-agent session.

The summary must let a fresh agent implement the requested continuation without access to this conversation. Incorporate the optional focus as the direction of the summary, not as a separate aside. Capture the goal, relevant repository and branch state, decisions and constraints, work already completed, concrete file/symbol anchors, remaining steps, validation expectations, and material risks or unknowns. Distinguish verified facts from assumptions. Omit conversational filler. Return only the summary text; do not wrap it in a slash command or a code fence.`;

interface GenerateImplementationSummaryOptions {
	readonly callModelText: typeof callPiModelText;
	readonly modelSelection: ModelSelection;
	readonly modelRegistry: PiModelRegistryLike;
	readonly sessionContext: string;
	readonly focus: string;
}

export interface HerdrSessionSpaceImplRegistrationOptions {
	/** Test seam matching callPiModelText; faked at the true external boundary. */
	readonly callModelText?: typeof callPiModelText;
}

export function registerHerdrSessionSpaceImplCommand(
	context: Pick<HerdrPiContext, "commands">,
	options: HerdrSessionSpaceImplRegistrationOptions = {},
): void {
	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
		commandDefinition: {
			description: "Draft the current session as a prompt for implementation in a new space.",
			argumentHint: "[focus]",
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				if (ctx.ui.setEditorText === undefined) {
					ctx.ui.notify("This Pi runtime cannot prefill editor text.", "error");
					return;
				}
				if (ctx.model === undefined) {
					ctx.ui.notify("An active Pi model is required to summarize this session.", "error");
					return;
				}
				const modelRegistry = resolveModelRegistry(ctx.modelRegistry);
				if (modelRegistry === undefined) {
					ctx.ui.notify("This Pi runtime cannot authenticate the active model.", "error");
					return;
				}

				ctx.ui.setStatus?.(HERDR_SESSION_SPACE_IMPL_COMMAND_NAME, "summarizing session…");
				try {
					const generated = await generateImplementationSummary({
						callModelText: options.callModelText ?? callPiModelText,
						modelSelection: {
							provider: ctx.model.provider,
							modelId: ctx.model.id,
							thinking: normalizeThinking(context.commands.getThinkingLevel()),
						},
						modelRegistry,
						sessionContext: serializeActiveSessionContext(
							ctx.sessionManager.buildContextEntries?.() ?? ctx.sessionManager.getBranch(),
						),
						focus: args.trim(),
					});
					if (!generated.ok) {
						ctx.ui.notify(generated.message, "error");
						return;
					}
					const summary = generated.text.trim();
					if (summary === "") {
						ctx.ui.notify("The model returned an empty implementation summary.", "error");
						return;
					}
					ctx.ui.setEditorText(`/${HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME} ${summary}`);
					ctx.ui.notify(
						"Drafted the session implementation prompt in the editor. Review or edit it, then press Enter.",
						"info",
					);
				} finally {
					ctx.ui.setStatus?.(HERDR_SESSION_SPACE_IMPL_COMMAND_NAME, undefined);
				}
			},
		},
		options: { delivery: "message" },
	});
}

async function generateImplementationSummary(
	options: GenerateImplementationSummaryOptions,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
	const result = await options.callModelText({
		registry: options.modelRegistry,
		modelSelection: options.modelSelection,
		systemPrompt: SYSTEM_PROMPT,
		userText: buildSummaryRequest(options.sessionContext, options.focus),
		maxTokens: MAX_SUMMARY_TOKENS,
	});
	if (result.ok) return result;
	return {
		ok: false,
		message: formatPiModelCallFailure(result, {
			modelSelection: options.modelSelection,
			taskAction: "summarize the session",
		}),
	};
}

function buildSummaryRequest(sessionContext: string, focus: string): string {
	return [
		"## Continuation focus",
		focus === "" ? "(No additional focus was supplied.)" : focus,
		"",
		"## Current active Pi session context",
		sessionContext,
	].join("\n");
}

function serializeActiveSessionContext(
	entries: readonly { readonly type: string; readonly [key: string]: unknown }[],
): string {
	return truncateTextHeadTail({
		value: JSON.stringify(entries, null, 2),
		maxChars: MAX_SESSION_CONTEXT_CHARS,
		headRatio: 0,
		buildMarker: () => "[Earlier active-session context truncated to fit the summary request.]\n",
	});
}

function resolveModelRegistry(registry: ModelRegistry): PiModelRegistryLike | undefined {
	if (registry.getApiKeyAndHeaders === undefined) return undefined;
	return {
		find: (provider, modelId) => registry.find(provider, modelId),
		getApiKeyAndHeaders: registry.getApiKeyAndHeaders.bind(registry),
	};
}

/** callPiModelText rejects "off"; summarize at "minimal" instead of failing off-thinking users. */
function normalizeThinking(
	thinking: ReturnType<HerdrPiContext["commands"]["getThinkingLevel"]>,
): ModelSelection["thinking"] {
	return thinking === "off" ? "minimal" : thinking;
}
