import {
	buildFencedTextBlock,
	formatErrorMessage,
	optionalEntries,
} from "@nseng-ai/foundation/primitives";
import { HANDOFF_NAMESPACE, handoffSlugToKey, parseFlatHandoffSlug } from "../api/index.ts";

import { isRecord, stringField } from "@nseng-ai/pi/runtime/primitives";
import { formatPickupHandoffCommand } from "./identity.ts";
import { currentBranch } from "./branch-resolution.ts";
import { DERIVE_HANDOFF_SLUG_TOOL_NAME } from "./command-constants.ts";
import { resolveCreateFocus } from "./create-focus.ts";
import { CREATE_HANDOFF_FALLBACK } from "./create-prompt.ts";
import { realHandoffCreateSkillLoader, type HandoffCreateSkillLoader } from "./create-skill.ts";
import { checkHandoffExists } from "./handoff-existence.ts";
import { createHandoffStartMessage, setStatus, type HandoffStartMessages } from "./ui-status.ts";
import type { ExpandedSkillBlock } from "@nseng-ai/pi/skills/expansion";
import type { PiHandoffContext } from "./api-context.ts";
import type {
	CommandContext,
	ExtensionAPI,
	ToolContext,
	ToolDefinition,
	ToolResult,
} from "./runtime-types.ts";

export interface HandoffLaunchRequest {
	branch: string;
	focus: string;
}

export interface PreparedHandoffCreateLaunch {
	request: HandoffLaunchRequest;
	skill: ExpandedSkillBlock | undefined;
	skillReadError: string | undefined;
}

export interface HandoffLaunchPromptOptions {
	skillBlock: string | undefined;
	request: HandoffLaunchRequest;
	extraTargetSections?: string[];
	toolCallInstruction?: string;
	extraRequirements?: string[];
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
	handoffContext: PiHandoffContext;
	skillLoader?: HandoffCreateSkillLoader;
	preflight?(options: {
		pi: ExtensionAPI;
		ctx: CommandContext;
		request: HandoffLaunchRequest;
	}): Promise<{ type: "ok" } | { type: "failed"; message: string }>;
}

export interface HandoffLaunchParams {
	branch: string;
	slug: string;
	key: string;
	pickupCommand: string;
}

export type HandoffLaunchParamsParseResult<P extends HandoffLaunchParams = HandoffLaunchParams> =
	| { type: "valid"; params: P }
	| { type: "invalid"; message: string };

export interface HandoffLaunchToolSpec<P extends HandoffLaunchParams = HandoffLaunchParams> {
	name: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
	statusKey: string;
	verifyStatus(params: P): string;
	verifyUpdate?: string;
	missingMessage(params: P): string;
	verifyFailureDetails?(message: string, params: P): unknown;
	extraParameters?: { properties: Record<string, unknown>; required?: string[] };
	parseParams?(params: unknown): HandoffLaunchParamsParseResult<P>;
	gate?(ctx: ToolContext, params: P, signal: AbortSignal | undefined): string | undefined;
	launch(options: {
		params: P;
		ctx: ToolContext;
		signal: AbortSignal | undefined;
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined;
	}): Promise<ToolResult> | ToolResult;
}

export interface VerifyHandoffLaunchOptions<P extends HandoffLaunchParams = HandoffLaunchParams> {
	params: P;
	statusKey: string;
	verifyStatus: string;
	verifyUpdate?: string;
	missingMessage(params: P): string;
	failureDetails?: (message: string, params: P) => unknown;
	onUpdate?: (update: Partial<ToolResult>) => void;
}

export type VerifyHandoffLaunchResult = { type: "ok" } | { type: "failed"; result: ToolResult };

export function buildHandoffLaunchRequest(options: {
	branch: string;
	focus: string;
}): HandoffLaunchRequestBuildResult {
	const focus = options.focus.trim();
	if (!/[a-z0-9]/i.test(focus)) {
		return {
			type: "invalid",
			message: "Continuation focus must contain at least one letter or number.",
		};
	}
	return { type: "valid", request: { branch: options.branch, focus } };
}

export function buildHandoffLaunchPrompt(
	copy: HandoffLaunchPromptCopy,
	options: HandoffLaunchPromptOptions,
): string {
	const request = options.request;
	const targetSections = [
		`Use this storage target:\n\n- Branch: ${request.branch}\n- Namespace: ${HANDOFF_NAMESPACE}\n- Entry: derive from the final Markdown handoff content with ${DERIVE_HANDOFF_SLUG_TOOL_NAME}`,
		...(options.extraTargetSections ?? []),
	];
	const requirements = [
		"Compose the final Markdown handoff artifact content first, using the existing handoff-create workflow.",
		`Call ${DERIVE_HANDOFF_SLUG_TOOL_NAME} with exactly that final Markdown content.`,
		"Use the returned slug/key. Do not derive the entry name from the raw continuation focus.",
		`Store the exact final Markdown content through /dev/stdin with \`ns handoff create --slug <returned-slug> --branch ${request.branch} --file /dev/stdin\`. Do not create a temporary artifact file.`,
		`If \`ns handoff create\` reports an existing artifact, stop; do not overwrite and ${copy.abortClause}.`,
		options.toolCallInstruction ??
			`After \`ns handoff create\` succeeds, call ${copy.toolName} with \`branch\` set to \`${request.branch}\` and \`slug\` set to the slug returned by ${DERIVE_HANDOFF_SLUG_TOOL_NAME}.`,
		`Do not call ${copy.toolName} before the handoff is saved successfully.`,
		...(options.extraRequirements ?? []),
	];
	return `${options.skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${copy.commandName} request. ${copy.intentSentence}

Continuation focus:

${buildFencedTextBlock(request.focus)}

${targetSections.join("\n\n")}

Hard requirements:

${requirements.map((requirement, index) => `${index + 1}. ${requirement}`).join("\n")}

${copy.previewHeading}

${buildFencedTextBlock(copy.previewBody(request.branch))}`;
}

export async function prepareHandoffCreateLaunch(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	options: {
		handoffContext: PiHandoffContext;
		preflight?: HandoffLaunchCommandSpec["preflight"];
		skillLoader?: HandoffCreateSkillLoader;
	},
): Promise<PreparedHandoffCreateLaunch | undefined> {
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return undefined;
	}

	let branch: string;
	try {
		branch = await currentBranch(options.handoffContext.git, ctx, "create");
	} catch (error) {
		ctx.ui.notify(formatErrorMessage(error), "error");
		return undefined;
	}

	const builtRequest = buildHandoffLaunchRequest({ branch, focus });
	if (builtRequest.type === "invalid") {
		ctx.ui.notify(builtRequest.message, "error");
		return undefined;
	}
	const request = builtRequest.request;

	const preflight = await options.preflight?.({ pi, ctx, request });
	if (preflight?.type === "failed") {
		ctx.ui.notify(preflight.message, "error");
		return undefined;
	}

	const loadedSkill = await (
		options.skillLoader ?? realHandoffCreateSkillLoader
	).loadCreateHandoffSkill(ctx.cwd);
	const skill = loadedSkill.type === "found" ? loadedSkill.skill : undefined;
	const skillReadError = loadedSkill.type === "failed" ? loadedSkill.message : undefined;

	return { request, skill, skillReadError };
}

export async function runHandoffCreateCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	spec: HandoffLaunchCommandSpec,
): Promise<void> {
	await ctx.waitForIdle();
	const prepared = await prepareHandoffCreateLaunch(pi, args, ctx, {
		handoffContext: spec.handoffContext,
		...optionalEntries({ preflight: spec.preflight, skillLoader: spec.skillLoader }),
	});
	if (prepared === undefined) {
		return;
	}

	ctx.ui.notify(
		createHandoffStartMessage(spec.startMessages, prepared.skill, prepared.skillReadError),
		prepared.skill ? "info" : "warning",
	);
	pi.sendUserMessage(
		buildHandoffLaunchPrompt(spec.promptCopy, {
			skillBlock: prepared.skill?.block,
			request: prepared.request,
		}),
		{ deliverAs: "followUp" },
	);
}

export async function verifyHandoffLaunchTarget<P extends HandoffLaunchParams>(
	pi: ExtensionAPI,
	ctx: ToolContext,
	options: VerifyHandoffLaunchOptions<P>,
): Promise<VerifyHandoffLaunchResult> {
	if (options.verifyUpdate !== undefined) {
		options.onUpdate?.({ content: [{ type: "text", text: options.verifyUpdate }] });
	}
	setStatus(ctx, options.statusKey, options.verifyStatus);
	try {
		const exists = await checkHandoffExists({
			pi,
			cwd: ctx.cwd,
			branch: options.params.branch,
			key: options.params.key,
		});
		if (exists.type === "missing") {
			const message = options.missingMessage(options.params);
			return {
				type: "failed",
				result: handoffLaunchToolFailure(
					message,
					options.failureDetails?.(message, options.params),
				),
			};
		}
		if (exists.type === "failed") {
			return {
				type: "failed",
				result: handoffLaunchToolFailure(
					exists.message,
					options.failureDetails?.(exists.message, options.params),
				),
			};
		}
		return { type: "ok" };
	} finally {
		setStatus(ctx, options.statusKey, undefined);
	}
}

export function buildHandoffLaunchTool<P extends HandoffLaunchParams = HandoffLaunchParams>(
	pi: ExtensionAPI,
	spec: HandoffLaunchToolSpec<P>,
): ToolDefinition {
	const parseParams =
		spec.parseParams ??
		((params: unknown): HandoffLaunchParamsParseResult<P> =>
			parseHandoffLaunchParams(params, spec.name) as HandoffLaunchParamsParseResult<P>);
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
				...spec.extraParameters?.properties,
			},
			required: ["branch", "slug", ...(spec.extraParameters?.required ?? [])],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const parsed = parseParams(params);
			if (parsed.type === "invalid") {
				return handoffLaunchToolFailure(parsed.message);
			}

			const gateFailure = spec.gate?.(ctx, parsed.params, signal);
			if (gateFailure !== undefined) {
				return handoffLaunchToolFailure(gateFailure);
			}

			const verified = await verifyHandoffLaunchTarget(pi, ctx, {
				params: parsed.params,
				statusKey: spec.statusKey,
				verifyStatus: spec.verifyStatus(parsed.params),
				missingMessage: spec.missingMessage,
				...optionalEntries({
					verifyUpdate: spec.verifyUpdate,
					failureDetails: spec.verifyFailureDetails,
					onUpdate,
				}),
			});
			if (verified.type === "failed") {
				return verified.result;
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

export function parseHandoffLaunchParams(
	params: unknown,
	toolName: string,
): HandoffLaunchParamsParseResult {
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
