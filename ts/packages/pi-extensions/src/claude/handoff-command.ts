import { formatErrorMessage } from "@asdl/core/primitives";

import {
	CREATE_HANDOFF_FALLBACK,
	CREATE_HANDOFF_SKILL_NAME,
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
	checkHandoffExists,
	currentBranch,
	expandHandoffSkill,
	fencedBlock,
	resolveCreateFocus,
	setStatus,
} from "../handoff/shared.ts";
import { HANDOFF_NAMESPACE, handoffSlugToKey, parseFlatHandoffSlug } from "../handoff/identity.ts";
import type { BaseRuntimeContext, CommandContext, ExtensionAPI, ToolDefinition, ToolResult } from "../handoff/runtime-types.ts";

export const CLAUDE_HANDOFF_COMMAND_NAME = "claude:handoff";
export const CLAUDE_HANDOFF_LAUNCH_TOOL_NAME = "claude_handoff_launch";

export interface InteractiveClaudeInvocation {
	cwd: string;
	prompt: string;
	env: Record<string, string | undefined>;
}

export type InteractiveClaudeRunResult =
	| { type: "exited"; code: number | null; signal: string | null }
	| { type: "spawn-failed"; message: string };

export type RunInteractiveClaude = (invocation: InteractiveClaudeInvocation) => InteractiveClaudeRunResult;

export interface ClaudeHandoffDeps {
	runClaude: RunInteractiveClaude;
	env: Record<string, string | undefined>;
}

export interface ClaudeHandoffRequest {
	branch: string;
	focus: string;
}

export function scrubClaudeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const scrubbed = { ...env };
	delete scrubbed.ANTHROPIC_API_KEY;
	delete scrubbed.ANTHROPIC_AUTH_TOKEN;
	return scrubbed;
}

export function buildClaudeHandoffPrompt(options: { skillBlock: string | undefined; request: ClaudeHandoffRequest }): string {
	const request = options.request;
	return `${options.skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${CLAUDE_HANDOFF_COMMAND_NAME} request. Create a directed handoff artifact for the current Pi session before launching Claude Code, then launch Claude Code to pick up that saved handoff.

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
4. Check for an existing artifact with \`brmem check <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch}\`. If it exists, stop; do not overwrite and do not launch Claude.
5. If missing, store the exact final Markdown content directly through /dev/stdin with \`brmem put <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch} --file /dev/stdin\`. Do not create a temporary artifact file.
6. After \`brmem put\` succeeds, call ${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} with \`branch\` set to \`${request.branch}\` and \`slug\` set to the slug returned by ${DERIVE_HANDOFF_SLUG_TOOL_NAME}.
7. Do not call ${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} before the handoff is saved successfully.

The Claude Code session will be asked to pick up:

${fencedBlock("text", `handoff ${request.branch} <returned-slug>`)}`;
}

export function buildClaudePickupPrompt(branch: string, slug: string): string {
	const key = handoffSlugToKey(slug);
	return `Use the installed handoff-pickup skill to pick up this saved handoff, then present the handoff summary and wait for the user's next instruction.

Branch: ${branch}
Namespace: ${HANDOFF_NAMESPACE}
Entry: ${key}
Slug: ${slug}

If a Pi slash-command equivalent is useful, the pickup target is /handoff:pickup --branch ${branch} ${slug}.

Do not create a new handoff. Read and follow the existing handoff artifact from Branch Memory. If the handoff cannot be read, report the exact failure and stop.`;
}

export async function handleClaudeHandoffCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	_deps: ClaudeHandoffDeps,
): Promise<void> {
	if (!canUseInteractiveClaude(ctx)) {
		ctx.ui.notify("/claude:handoff requires interactive TUI mode so the terminal can be handed to Claude Code after the handoff is created.", "error");
		return;
	}

	if (pi.registerTool === undefined) {
		ctx.ui.notify("/claude:handoff requires tool support so the saved handoff can launch Claude after creation.", "error");
		return;
	}

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

	let skill: Awaited<ReturnType<typeof expandHandoffSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandHandoffSkill(pi, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = formatErrorMessage(error);
	}

	ctx.ui.notify(createClaudeHandoffStartMessage(skill, skillReadError), skill ? "info" : "warning");
	pi.sendUserMessage(buildClaudeHandoffPrompt({ skillBlock: skill?.block, request: { branch, focus } }));
}

export function buildClaudeHandoffLaunchTool(pi: ExtensionAPI, deps: ClaudeHandoffDeps): ToolDefinition {
	return {
		name: CLAUDE_HANDOFF_LAUNCH_TOOL_NAME,
		label: "Launch Claude Handoff",
		description: "Verify a saved handoff exists, then launch Claude Code to pick it up interactively.",
		promptSnippet: "Launch Claude Code to pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} only after a /${CLAUDE_HANDOFF_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} verifies the handoff exists before launching Claude; do not call it before brmem put succeeds.`,
		],
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
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const parsed = parseClaudeHandoffLaunchParams(params);
			if (parsed.type === "invalid") {
				return claudeHandoffToolFailure(parsed.message);
			}

			if (!canUseInteractiveClaude(ctx)) {
				return claudeHandoffToolFailure("Claude handoff launch requires interactive TUI mode so the terminal can be handed to Claude Code.");
			}

			const key = handoffSlugToKey(parsed.slug);
			setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, `verifying ${parsed.slug}…`);
			try {
				const exists = await checkHandoffExists(pi, ctx.cwd, parsed.branch, key);
				if (exists.type === "missing") {
					return claudeHandoffToolFailure(`Handoff ${parsed.slug} does not exist on branch ${parsed.branch}; not launching Claude.`);
				}
				if (exists.type === "failed") {
					return claudeHandoffToolFailure(exists.message);
				}
			} finally {
				setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, undefined);
			}

			onUpdate?.({ content: [{ type: "text", text: "Launching Claude Code to pick up the saved handoff…" }] });
			const prompt = buildClaudePickupPrompt(parsed.branch, parsed.slug);
			const outcome = await runInteractiveClaudeInStoppedTui(ctx, prompt, deps);
			if (outcome.type === "spawn-failed") {
				return claudeHandoffToolFailure(`Failed to launch Claude Code: ${outcome.message}. Is Claude Code installed and on PATH?`);
			}

			return {
				content: [{ type: "text", text: `Claude Code exited after pickup${formatClaudeExitSuffix(outcome)}.` }],
				details: {
					type: "launched",
					branch: parsed.branch,
					slug: parsed.slug,
					code: outcome.code,
					signal: outcome.signal,
				},
			};
		},
	};
}

export function registerClaudeHandoffCommand(pi: ExtensionAPI, deps: ClaudeHandoffDeps): void {
	pi.registerTool?.(buildClaudeHandoffLaunchTool(pi, deps));
	pi.registerCommand(CLAUDE_HANDOFF_COMMAND_NAME, {
		description: "Create a handoff, then pick it up in an interactive Claude Code session.",
		handler: async (args, ctx) => handleClaudeHandoffCommand(pi, args, ctx, deps),
	});
}

function parseClaudeHandoffLaunchParams(params: unknown): { type: "valid"; branch: string; slug: string } | { type: "invalid"; message: string } {
	if (typeof params !== "object" || params === null) {
		return { type: "invalid", message: `${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} parameters must be an object.` };
	}
	const fields = params as { branch?: unknown; slug?: unknown };
	if (typeof fields.branch !== "string" || fields.branch.trim().length === 0) {
		return { type: "invalid", message: `${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} requires a non-empty branch.` };
	}
	if (typeof fields.slug !== "string") {
		return { type: "invalid", message: `${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} requires a non-empty slug.` };
	}
	const parsedSlug = parseFlatHandoffSlug(fields.slug, `${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} slug`);
	if (parsedSlug.type === "invalid") {
		return { type: "invalid", message: parsedSlug.message };
	}
	return { type: "valid", branch: fields.branch, slug: parsedSlug.slug };
}

function canUseInteractiveClaude(ctx: BaseRuntimeContext): boolean {
	return ctx.mode === "tui" && ctx.ui.custom !== undefined;
}

function createClaudeHandoffStartMessage(skill: Awaited<ReturnType<typeof expandHandoffSkill>>, skillReadError: string | undefined): string {
	if (skill !== undefined) {
		return "Starting Claude handoff create workflow…";
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback handoff-create workflow prompt. ${skillReadError}`;
	}
	return "handoff-create skill was not found; using fallback handoff-create workflow prompt.";
}

async function runInteractiveClaudeInStoppedTui(
	ctx: BaseRuntimeContext,
	prompt: string,
	deps: ClaudeHandoffDeps,
): Promise<InteractiveClaudeRunResult> {
	const custom = ctx.ui.custom;
	if (custom === undefined) {
		return { type: "spawn-failed", message: "interactive TUI custom UI is unavailable" };
	}
	return custom<InteractiveClaudeRunResult>((tui, _theme, _keybindings, done) => {
		tui.stop();
		const result = deps.runClaude({ cwd: ctx.cwd, prompt, env: scrubClaudeEnv(deps.env) });
		tui.start();
		tui.requestRender(true);
		done(result);
		return { render: () => [], invalidate: () => {} };
	});
}

function claudeHandoffToolFailure(message: string): ToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

function formatClaudeExitSuffix(outcome: Extract<InteractiveClaudeRunResult, { type: "exited" }>): string {
	if (outcome.code !== null && outcome.code !== 0) {
		return ` (exit code ${outcome.code})`;
	}
	if (outcome.signal !== null) {
		return ` (signal ${outcome.signal})`;
	}
	return "";
}
