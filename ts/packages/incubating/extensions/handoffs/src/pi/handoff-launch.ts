import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import { isRecord, stringField } from "@nseng-ai/pi-runtime/runtime/primitives";

import { handoffSlugToKey } from "../api/index.ts";
import { createPiHandoffContext } from "./api-context.ts";
import { DERIVE_HANDOFF_SLUG_TOOL_NAME } from "./command-constants.ts";
import { deriveHandoffContentSlug } from "./content-slug.ts";
import {
	buildHandoffLaunchTool,
	handoffLaunchToolFailure,
	runHandoffCreateCommand,
	type HandoffLaunchCommandSpec,
	type HandoffLaunchParams,
	type HandoffLaunchToolSpec,
} from "./launch-flow.ts";
import { setStatus } from "./ui-status.ts";
import type { HandoffCreateSkillLoader } from "./create-skill.ts";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { ExtensionAPI, ToolDefinition } from "./runtime-types.ts";

const slugToolRegistrations = new WeakSet<ExtensionAPI>();

export interface HandoffPromptCreateIntegration {
	registerContentSlugTool(): void;
	registerContentSlugToolIfMissing(): void;
	runCreateCommand(
		args: string,
		ctx: Parameters<typeof runHandoffCreateCommand>[2],
		spec: Omit<HandoffLaunchCommandSpec, "git">,
	): Promise<void>;
}

export interface HandoffLaunchIntegration extends HandoffPromptCreateIntegration {
	buildVerifiedLaunchTool<P extends HandoffLaunchParams = HandoffLaunchParams>(
		spec: HandoffLaunchToolSpec<P>,
	): ToolDefinition;
}

export interface HandoffLaunchIntegrationOptions {
	skillLoader?: HandoffCreateSkillLoader;
}

export function createHandoffLaunchIntegration(
	pi: ExtensionAPI,
	options: HandoffLaunchIntegrationOptions = {},
): HandoffLaunchIntegration {
	const commands = createPiCommandExecApi(pi);
	const handoffContext = createPiHandoffContext(commands);
	return {
		registerContentSlugTool(): void {
			if (pi.registerTool === undefined || slugToolRegistrations.has(pi)) return;
			pi.registerTool(buildDeriveHandoffSlugTool(commands));
			slugToolRegistrations.add(pi);
		},
		registerContentSlugToolIfMissing(): void {
			if (pi.getAllTools?.().some((tool) => tool.name === DERIVE_HANDOFF_SLUG_TOOL_NAME)) {
				return;
			}
			this.registerContentSlugTool();
		},
		async runCreateCommand(args, ctx, spec): Promise<void> {
			await runHandoffCreateCommand(pi, args, ctx, {
				...spec,
				git: handoffContext.git,
				...optionalEntry("skillLoader", options.skillLoader),
			});
		},
		buildVerifiedLaunchTool<P extends HandoffLaunchParams>(
			spec: HandoffLaunchToolSpec<P>,
		): ToolDefinition {
			return buildHandoffLaunchTool(commands, spec);
		},
	};
}

function buildDeriveHandoffSlugTool(commands: CommandExecApi): ToolDefinition {
	return {
		name: DERIVE_HANDOFF_SLUG_TOOL_NAME,
		label: "Derive Handoff Slug",
		description: "Derive a flat semantic handoff slug from final Markdown handoff content.",
		promptSnippet:
			"Derive a flat semantic handoff slug from the final Markdown handoff content before checking or writing Branch Memory.",
		promptGuidelines: [
			`Use ${DERIVE_HANDOFF_SLUG_TOOL_NAME} after composing the final Markdown handoff artifact content.`,
			"Do not derive the handoff entry name from the raw continuation focus when this tool is available.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				content: { type: "string", description: "Final Markdown handoff artifact content." },
			},
			required: ["content"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const content = parseDeriveHandoffSlugParams(params);
			if (content.type === "invalid") return handoffLaunchToolFailure(content.message);

			onUpdate?.({
				content: [{ type: "text", text: "Deriving handoff slug from final artifact content…" }],
			});
			setStatus(ctx, DERIVE_HANDOFF_SLUG_TOOL_NAME, "deriving handoff slug…");
			try {
				const evidence = await deriveHandoffContentSlug(commands, {
					content: content.content,
					cwd: ctx.cwd,
					...optionalEntry("signal", signal),
				});
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
				setStatus(ctx, DERIVE_HANDOFF_SLUG_TOOL_NAME, undefined);
			}
		},
	};
}

function parseDeriveHandoffSlugParams(
	params: unknown,
): { type: "valid"; content: string } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return {
			type: "invalid",
			message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} parameters must be an object.`,
		};
	}
	const content = stringField(params, "content");
	if (content === undefined || content.trim().length === 0) {
		return {
			type: "invalid",
			message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} requires non-empty final Markdown content.`,
		};
	}
	return { type: "valid", content };
}

export type { CommandContext, ToolDefinition, ToolResult } from "./runtime-types.ts";
export type { ExtensionAPI as HandoffExtensionAPI } from "./runtime-types.ts";
export type {
	HandoffLaunchCommandSpec,
	HandoffLaunchParams,
	HandoffLaunchParamsParseResult,
	HandoffLaunchPromptCopy,
	HandoffLaunchToolSpec,
} from "./launch-flow.ts";
export {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchRequest,
	parseHandoffLaunchParams,
} from "./launch-flow.ts";
export type { HandoffCreateSkillLoader } from "./create-skill.ts";
export type { HandoffStartMessages } from "./ui-status.ts";
