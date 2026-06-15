import {
	formatHandoffTabLaunchSuccess,
	launchHandoffTab,
	type HandoffTabLaunchResult,
} from "@asdl/ccc/handoff-tab";
import { formatErrorMessage } from "@asdl/core/primitives";
import { handoffSlugToKey } from "@asdl/handoff/identity";
import { identifyCmuxCaller } from "../cmux/focused-terminal-tab.ts";
import { isRecord, stringField } from "../cmux/primitives.ts";
import { deriveHandoffContentSlug } from "./content-slug.ts";
import {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchRequest,
	buildHandoffLaunchTool,
	handoffLaunchToolFailure,
	runHandoffCreateCommand,
	type HandoffLaunchPromptCopy,
} from "./launch-flow.ts";
import {
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
	HANDOFF_TAB_COMMAND_NAME,
	HANDOFF_TAB_LAUNCH_TOOL_NAME,
	HANDOFF_TAB_STATUS_KEY,
	PICKUP_HANDOFF_COMMAND_NAME,
	setStatus,
	type HandoffStartMessages,
} from "./shared.ts";
import type { CommandContext, ExtensionAPI, ToolDefinition } from "./runtime-types.ts";

export type { HandoffTabLaunchResult };

export const HANDOFF_TAB_PROMPT_COPY = {
	commandName: HANDOFF_TAB_COMMAND_NAME,
	toolName: HANDOFF_TAB_LAUNCH_TOOL_NAME,
	intentSentence: "Create a directed handoff artifact for the current session, then launch a pickup Pi in a new cmux tab.",
	abortClause: "do not open a cmux tab",
	previewHeading: "The pickup tab will run:",
	previewBody(branch: string): string {
		return `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${branch} <returned-slug>`;
	},
} satisfies HandoffLaunchPromptCopy;

const HANDOFF_TAB_START_MESSAGES = {
	ready: "Starting ccc:handoff-tab workflow with content-derived slug…",
	fallbackLabel: "ccc:handoff-tab workflow prompt for a content-derived slug",
} satisfies HandoffStartMessages;

export const buildHandoffTabRequest = buildHandoffLaunchRequest;

export function buildHandoffTabPrompt(options: Parameters<typeof buildHandoffLaunchPrompt>[1]): string {
	return buildHandoffLaunchPrompt(HANDOFF_TAB_PROMPT_COPY, options);
}

export async function handleHandoffTabCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await runHandoffCreateCommand(pi, args, ctx, {
		statusKey: HANDOFF_TAB_STATUS_KEY,
		promptCopy: HANDOFF_TAB_PROMPT_COPY,
		startMessages: HANDOFF_TAB_START_MESSAGES,
		async preflight({ pi, ctx }) {
			setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "checking cmux context…");
			try {
				const caller = await identifyCmuxCaller(pi, ctx.cwd);
				if (caller.type === "failed") {
					return { type: "failed", message: caller.message };
				}
				return { type: "ok" };
			} finally {
				setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
			}
		},
	});
}

export function buildDeriveHandoffSlugTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: DERIVE_HANDOFF_SLUG_TOOL_NAME,
		label: "Derive Handoff Slug",
		description: "Derive a flat semantic handoff slug from final Markdown handoff content.",
		promptSnippet: "Derive a flat semantic handoff slug from the final Markdown handoff content before checking or writing Branch Memory.",
		promptGuidelines: [
			`Use ${DERIVE_HANDOFF_SLUG_TOOL_NAME} after composing the final Markdown handoff artifact content.`,
			"Do not derive the handoff entry name from the raw continuation focus when this tool is available.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				content: {
					type: "string",
					description: "Final Markdown handoff artifact content.",
				},
			},
			required: ["content"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const content = parseDeriveHandoffSlugParams(params);
			if (content.type === "invalid") {
				return handoffLaunchToolFailure(content.message);
			}

			onUpdate?.({ content: [{ type: "text", text: "Deriving handoff slug from final artifact content…" }] });
			setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "deriving handoff slug…");
			try {
				const evidence = await deriveHandoffContentSlug(pi, { content: content.content, cwd: ctx.cwd, signal });
				const key = handoffSlugToKey(evidence.slug);
				return {
					content: [{ type: "text", text: [`Slug: ${evidence.slug}`, `Entry: ${key}`].join("\n") }],
					details: {
						type: "derived",
						slug: evidence.slug,
						key,
						provider: evidence.provider,
						model: evidence.model,
					},
				};
			} catch (error) {
				return handoffLaunchToolFailure(formatErrorMessage(error));
			} finally {
				setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
			}
		},
	};
}

export function buildHandoffTabLaunchTool(pi: ExtensionAPI): ToolDefinition {
	return buildHandoffLaunchTool(pi, {
		name: HANDOFF_TAB_LAUNCH_TOOL_NAME,
		label: "Launch Handoff Tab",
		description:
			"Verify a saved handoff exists, then open a focused cmux terminal tab in the current workspace and launch Pi to pick up that handoff.",
		promptSnippet: "Open a focused cmux tab to pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${HANDOFF_TAB_LAUNCH_TOOL_NAME} only after a /${HANDOFF_TAB_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${HANDOFF_TAB_LAUNCH_TOOL_NAME} verifies the handoff exists before opening cmux; do not call it before brmem put succeeds.`,
		],
		statusKey: HANDOFF_TAB_STATUS_KEY,
		verifyStatus: () => "verifying saved handoff…",
		verifyUpdate: "Verifying saved handoff…",
		missingMessage: (params) => `No handoff ${params.slug} found on branch ${params.branch}; no cmux tab was opened.`,
		verifyFailureDetails(message, params): HandoffTabLaunchResult {
			return { type: "failed", branch: params.branch, slug: params.slug, message };
		},
		async launch({ params, ctx, signal, onUpdate }) {
			const launched = await launchHandoffTab({
				host: pi,
				cwd: ctx.cwd,
				model: ctx.model,
				hasUI: ctx.hasUI,
				ui: ctx.ui,
				statusKey: HANDOFF_TAB_STATUS_KEY,
				params,
				signal,
				onUpdate,
			});
			if (launched.type === "failed") {
				return handoffLaunchToolFailure(launched.message, launched);
			}
			return {
				content: [{ type: "text", text: formatHandoffTabLaunchSuccess(launched) }],
				details: launched,
			};
		},
	});
}

function parseDeriveHandoffSlugParams(params: unknown): { type: "valid"; content: string } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return { type: "invalid", message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} parameters must be an object.` };
	}
	const content = stringField(params, "content");
	if (content === undefined || content.trim().length === 0) {
		return { type: "invalid", message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} requires non-empty final Markdown content.` };
	}
	return { type: "valid", content };
}
