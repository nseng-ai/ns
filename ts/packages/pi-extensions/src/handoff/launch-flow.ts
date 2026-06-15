import { formatErrorMessage } from "@asdl/core/primitives";
import { HANDOFF_NAMESPACE, handoffSlugToKey, parseFlatHandoffSlug } from "@asdl/handoff/identity";

import { isRecord, stringField } from "../cmux/primitives.ts";
import { formatPickupHandoffCommand } from "./identity.ts";
import {
	CREATE_HANDOFF_FALLBACK,
	CREATE_HANDOFF_SKILL_NAME,
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
	checkHandoffExists,
	createHandoffStartMessage,
	currentBranch,
	expandHandoffSkill,
	fencedBlock,
	resolveCreateFocus,
	setStatus,
	type HandoffStartMessages,
} from "./shared.ts";
import type { BaseRuntimeContext, CommandContext, ExtensionAPI, ToolDefinition, ToolResult } from "./runtime-types.ts";

export interface HandoffLaunchRequest {
	branch: string;
	focus: string;
}

export type HandoffLaunchRequestBuildResult =
	| { type: "valid"; request: HandoffLaunchRequest }
	| { type: "invalid"; message: string };

export interface HandoffLaunchPromptCopy {
	commandName: string;
	toolName: string;
	intentSentence: string;
	abortClause: string;
	previewHeading: string;
	previewBody(branch: string): string;
}

export interface HandoffLaunchCommandSpec {
	statusKey: string;
	promptCopy: HandoffLaunchPromptCopy;
	startMessages: HandoffStartMessages;
	preflight?(options: { pi: ExtensionAPI; ctx: CommandContext; request: HandoffLaunchRequest }): Promise<{ type: "ok" } | { type: "failed"; message: string }>;
}

export interface HandoffLaunchParams {
	branch: string;
	slug: string;
	key: string;
	pickupCommand: string;
}

export interface HandoffLaunchToolSpec {
	name: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
	statusKey: string;
	verifyStatus(params: HandoffLaunchParams): string;
	verifyUpdate?: string;
	missingMessage(params: HandoffLaunchParams): string;
	verifyFailureDetails?(message: string, params: HandoffLaunchParams): unknown;
	gate?(ctx: BaseRuntimeContext, params: HandoffLaunchParams): string | undefined;
	launch(options: {
		params: HandoffLaunchParams;
		ctx: BaseRuntimeContext;
		signal: AbortSignal | undefined;
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined;
	}): Promise<ToolResult> | ToolResult;
}

export function buildHandoffLaunchRequest(options: { branch: string; focus: string }): HandoffLaunchRequestBuildResult {
	const focus = options.focus.trim();
	if (!/[a-z0-9]/i.test(focus)) {
		return { type: "invalid", message: "Continuation focus must contain at least one letter or number." };
	}
	return { type: "valid", request: { branch: options.branch, focus } };
}

export function buildHandoffLaunchPrompt(copy: HandoffLaunchPromptCopy, options: { skillBlock: string | undefined; request: HandoffLaunchRequest }): string {
	const request = options.request;
	return `${options.skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${copy.commandName} request. ${copy.intentSentence}

Continuation focus:

${fencedBlock("text", request.focus)}

Use this storage target:

- Branch: ${request.branch}
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: derive from the final Markdown handoff content with ${DERIVE_HANDOFF_SLUG_TOOL_NAME}

Hard requirements:

1. Compose the final Markdown handoff artifact content first, using the existing handoff-create workflow.
2. Call ${DERIVE_HANDOFF_SLUG_TOOL_NAME} with exactly that final Markdown content.
3. Use the returned slug/key. Do not derive the entry name from the raw continuation focus.
4. Check for an existing artifact with \`brmem check <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch}\`. If it exists, stop; do not overwrite and ${copy.abortClause}.
5. If missing, store the exact final Markdown content directly through /dev/stdin with \`brmem put <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch} --file /dev/stdin\`. Do not create a temporary artifact file.
6. After \`brmem put\` succeeds, call ${copy.toolName} with \`branch\` set to \`${request.branch}\` and \`slug\` set to the slug returned by ${DERIVE_HANDOFF_SLUG_TOOL_NAME}.
7. Do not call ${copy.toolName} before the handoff is saved successfully.

${copy.previewHeading}

${fencedBlock("text", copy.previewBody(request.branch))}`;
}

export async function runHandoffCreateCommand(pi: ExtensionAPI, args: string, ctx: CommandContext, spec: HandoffLaunchCommandSpec): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	let branch: string;
	try {
		branch = await currentBranch(pi, ctx, "create");
	} catch (error) {
		ctx.ui.notify(formatErrorMessage(error), "error");
		return;
	}

	const builtRequest = buildHandoffLaunchRequest({ branch, focus });
	if (builtRequest.type === "invalid") {
		ctx.ui.notify(builtRequest.message, "error");
		return;
	}
	const request = builtRequest.request;

	const preflight = await spec.preflight?.({ pi, ctx, request });
	if (preflight?.type === "failed") {
		ctx.ui.notify(preflight.message, "error");
		return;
	}

	let skill: Awaited<ReturnType<typeof expandHandoffSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandHandoffSkill(ctx.cwd, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = formatErrorMessage(error);
	}

	ctx.ui.notify(createHandoffStartMessage(spec.startMessages, skill, skillReadError), skill ? "info" : "warning");
	pi.sendUserMessage(buildHandoffLaunchPrompt(spec.promptCopy, { skillBlock: skill?.block, request }), { deliverAs: "followUp" });
}

export function buildHandoffLaunchTool(pi: ExtensionAPI, spec: HandoffLaunchToolSpec): ToolDefinition {
	return {
		name: spec.name,
		label: spec.label,
		description: spec.description,
		promptSnippet: spec.promptSnippet,
		promptGuidelines: spec.promptGuidelines,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				branch: {
					type: "string",
					description: "Git branch where the handoff was saved.",
				},
				slug: {
					type: "string",
					description: "Flat semantic handoff slug without .md.",
				},
			},
			required: ["branch", "slug"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const parsed = parseHandoffLaunchParams(params, spec.name);
			if (parsed.type === "invalid") {
				return handoffLaunchToolFailure(parsed.message);
			}

			const gateFailure = spec.gate?.(ctx, parsed.params);
			if (gateFailure !== undefined) {
				return handoffLaunchToolFailure(gateFailure);
			}

			if (spec.verifyUpdate !== undefined) {
				onUpdate?.({ content: [{ type: "text", text: spec.verifyUpdate }] });
			}
			setStatus(ctx, spec.statusKey, spec.verifyStatus(parsed.params));
			try {
				const exists = await checkHandoffExists(pi, ctx.cwd, parsed.params.branch, parsed.params.key);
				if (exists.type === "missing") {
					const message = spec.missingMessage(parsed.params);
					return handoffLaunchToolFailure(message, spec.verifyFailureDetails?.(message, parsed.params));
				}
				if (exists.type === "failed") {
					return handoffLaunchToolFailure(exists.message, spec.verifyFailureDetails?.(exists.message, parsed.params));
				}
			} finally {
				setStatus(ctx, spec.statusKey, undefined);
			}

			return spec.launch({ params: parsed.params, ctx, signal, onUpdate });
		},
	};
}

export function handoffLaunchToolFailure(message: string, details?: unknown): ToolResult {
	return {
		content: [{ type: "text", text: message }],
		details,
		isError: true,
	};
}

function parseHandoffLaunchParams(params: unknown, toolName: string): { type: "valid"; params: HandoffLaunchParams } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return { type: "invalid", message: `${toolName} parameters must be an object.` };
	}
	const branch = stringField(params, "branch");
	const rawSlug = stringField(params, "slug");
	if (branch === undefined) {
		return { type: "invalid", message: `${toolName} requires a non-empty branch.` };
	}
	if (rawSlug === undefined) {
		return { type: "invalid", message: `${toolName} requires a non-empty slug.` };
	}
	const parsedSlug = parseFlatHandoffSlug(rawSlug, `${toolName} slug`);
	if (parsedSlug.type === "invalid") {
		return { type: "invalid", message: parsedSlug.message };
	}
	return {
		type: "valid",
		params: {
			branch,
			slug: parsedSlug.slug,
			key: handoffSlugToKey(parsedSlug.slug),
			pickupCommand: formatPickupHandoffCommand(branch, parsedSlug.slug),
		},
	};
}
