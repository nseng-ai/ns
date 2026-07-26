import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import { createPiHandoffGitGateway } from "./api-context.ts";
import {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchTool,
	handoffLaunchToolFailure,
	runHandoffCreateCommand,
	type HandoffLaunchPromptCopy,
} from "./launch-flow.ts";
import { HANDOFF_NAMESPACE, handoffSlugToKey } from "../api/index.ts";
import { formatPickupHandoffCommand } from "./identity.ts";
import type { HandoffStartMessages } from "./ui-status.ts";
import type {
	BaseRuntimeContext,
	CommandContext,
	ExtensionAPI,
	RenderComponent,
	ToolDefinition,
} from "./runtime-types.ts";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { InteractiveClaudeRunResult, RunInteractiveClaude } from "./interactive-claude.ts";
import {
	deriveHandoffInvestigationSources,
	deriveSourcePiSessionId,
	resolveSourcePiSessionId,
	type HandoffInvestigationSourceOptions,
} from "./investigation-sources.ts";

export { deriveSourcePiSessionId };

export type {
	InteractiveClaudeInvocation,
	InteractiveClaudeRunResult,
	RunInteractiveClaude,
} from "./interactive-claude.ts";

export const CLAUDE_HANDOFF_COMMAND_NAME = "claude:handoff";
export const CLAUDE_HANDOFF_LAUNCH_TOOL_NAME = "claude_handoff_launch";
export const CLAUDE_HANDOFF_STATUS_KEY = CLAUDE_HANDOFF_COMMAND_NAME;

export const claudeHandoffParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: CLAUDE_HANDOFF_COMMAND_NAME,
		workflow: "Create a handoff, then launch Claude Code to pick it up",
		parity: "WAIVED",
		fallback:
			"Create a handoff with handoff-create, then manually launch Claude Code or another harness and pick up the saved handoff.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/handoffs/pi",
		sourceModule: "claude-command",
		notes:
			"The handoff artifact is portable; handing the terminal to Claude Code is a Pi-native interactive session primitive.",
	},
] as const);

export interface ClaudeHandoffDeps {
	runClaude: RunInteractiveClaude;
	env: Record<string, string | undefined>;
}

export interface ClaudeHandoffRequest {
	branch: string;
	focus: string;
}

export interface ClaudeHandoffCommandOptions {
	pi: ExtensionAPI;
	args: string;
	ctx: CommandContext;
	git: GitGateway;
	launchToolRegistered: boolean;
}

export interface ClaudeHandoffLaunchDetails {
	type: "launched";
	branch: string;
	slug: string;
	code: number | null;
	signal: string | null;
}

type CustomUiFunction = NonNullable<BaseRuntimeContext["ui"]["custom"]>;

interface InteractiveClaudeContext extends BaseRuntimeContext {
	mode: "tui";
	ui: BaseRuntimeContext["ui"] & { custom: CustomUiFunction };
}

const CLAUDE_HANDOFF_PROMPT_COPY = {
	commandName: CLAUDE_HANDOFF_COMMAND_NAME,
	toolName: CLAUDE_HANDOFF_LAUNCH_TOOL_NAME,
	intentSentence:
		"Create a directed handoff artifact for the current Pi session before launching Claude Code, then launch Claude Code to pick up that saved handoff.",
	abortClause: "do not launch Claude",
	previewHeading: "The Claude Code session will be asked to pick up:",
	previewBody(branch: string): string {
		return formatPickupHandoffCommand(branch, "<returned-slug>");
	},
} satisfies HandoffLaunchPromptCopy;

const CLAUDE_HANDOFF_START_MESSAGES = {
	ready: "Starting Claude handoff create workflow…",
} satisfies HandoffStartMessages;

export function scrubClaudeEnv(
	env: Record<string, string | undefined>,
): Record<string, string | undefined> {
	const scrubbed = { ...env };
	delete scrubbed.ANTHROPIC_API_KEY;
	delete scrubbed.ANTHROPIC_AUTH_TOKEN;
	delete scrubbed.ANTHROPIC_BASE_URL;
	return scrubbed;
}

export function buildClaudeHandoffPrompt(options: {
	skillBlock: string;
	request: ClaudeHandoffRequest;
	investigationSources: HandoffInvestigationSourceOptions;
}): string {
	return buildHandoffLaunchPrompt(CLAUDE_HANDOFF_PROMPT_COPY, options);
}

const CLAUDE_HANDOFF_SESSION_NAME_PREFIX = "[from-pi]";

/**
 * Build the visually distinctive Claude Code session name for a handoff pickup.
 * Includes the source Pi session id segment when available, otherwise falls back
 * to the prefix-and-handoff form without the session-id segment.
 */
export function buildClaudeHandoffSessionName(
	slug: string,
	investigationSources: HandoffInvestigationSourceOptions,
): string {
	const handoff = `handoff: ${slug}`;
	const sessionId = resolveSourcePiSessionId(investigationSources);
	return sessionId === undefined
		? `${CLAUDE_HANDOFF_SESSION_NAME_PREFIX} ${handoff}`
		: `${CLAUDE_HANDOFF_SESSION_NAME_PREFIX} session-id:${sessionId} ${handoff}`;
}

export function buildClaudePickupPrompt(branch: string, slug: string): string {
	const key = handoffSlugToKey(slug);
	return `Use the installed handoff-pickup skill to pick up this saved handoff, then present the handoff summary and wait for the user's next instruction.

Branch: ${branch}
Namespace: ${HANDOFF_NAMESPACE}
Entry: ${key}
Slug: ${slug}

If a Pi slash-command equivalent is useful, the pickup target is ${formatPickupHandoffCommand(branch, slug)}.

Do not create a new handoff. Read and follow the existing handoff artifact from Branch Memory. If the handoff cannot be read, report the exact failure and stop.`;
}

export async function handleClaudeHandoffCommand(
	options: ClaudeHandoffCommandOptions,
): Promise<void> {
	const { pi, args, ctx, git, launchToolRegistered } = options;
	await runHandoffCreateCommand(pi, args, ctx, {
		git,
		statusKey: CLAUDE_HANDOFF_STATUS_KEY,
		promptCopy: CLAUDE_HANDOFF_PROMPT_COPY,
		startMessages: CLAUDE_HANDOFF_START_MESSAGES,
		preflight: async () => {
			if (!canUseInteractiveClaude(ctx)) {
				return {
					type: "failed",
					message:
						"/claude:handoff requires interactive TUI mode so the terminal can be handed to Claude Code after the handoff is created.",
				};
			}
			if (!launchToolRegistered) {
				return {
					type: "failed",
					message:
						"/claude:handoff requires tool support so the saved handoff can launch Claude after creation.",
				};
			}
			return { type: "ok" };
		},
	});
}

export function buildClaudeHandoffLaunchTool(
	commands: CommandExecApi,
	deps: ClaudeHandoffDeps,
): ToolDefinition {
	return buildHandoffLaunchTool(commands, {
		name: CLAUDE_HANDOFF_LAUNCH_TOOL_NAME,
		label: "Launch Claude Handoff",
		description:
			"Verify a saved handoff exists, then launch Claude Code to pick it up interactively.",
		promptSnippet:
			"Launch Claude Code to pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} only after a /${CLAUDE_HANDOFF_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} verifies the handoff exists before launching Claude; do not call it before ns handoff create succeeds.`,
		],
		statusKey: CLAUDE_HANDOFF_STATUS_KEY,
		verifyStatus: (params) => `verifying ${params.slug}…`,
		missingMessage: (params) =>
			`Handoff ${params.slug} does not exist on branch ${params.branch}; not launching Claude.`,
		gate(ctx) {
			return canUseInteractiveClaude(ctx)
				? undefined
				: "Claude handoff launch requires interactive TUI mode so the terminal can be handed to Claude Code.";
		},
		async launch({ params, ctx, onUpdate }) {
			const interactiveCtx = asInteractiveClaudeContext(ctx);
			if (interactiveCtx.type === "invalid") {
				return handoffLaunchToolFailure(interactiveCtx.message);
			}

			onUpdate?.({
				content: [{ type: "text", text: "Launching Claude Code to pick up the saved handoff…" }],
			});
			const prompt = buildClaudePickupPrompt(params.branch, params.slug);
			const name = buildClaudeHandoffSessionName(
				params.slug,
				deriveHandoffInvestigationSources(ctx),
			);
			const outcome = await runInteractiveClaudeInStoppedTui(
				interactiveCtx.ctx,
				prompt,
				name,
				deps,
				interactiveCtx.ctx.ui.custom,
			);
			if (outcome.type === "spawn-failed") {
				return handoffLaunchToolFailure(
					`Failed to launch Claude Code: ${outcome.message}. Is Claude Code installed and on PATH?`,
				);
			}

			return {
				content: [
					{
						type: "text",
						text: `Claude Code exited after pickup${formatClaudeExitSuffix(outcome)}.`,
					},
				],
				details: {
					type: "launched",
					branch: params.branch,
					slug: params.slug,
					code: outcome.code,
					signal: outcome.signal,
				} satisfies ClaudeHandoffLaunchDetails,
			};
		},
	});
}

export function registerClaudeHandoffCommand(pi: ExtensionAPI, deps: ClaudeHandoffDeps): void {
	const commands = createPiCommandExecApi(pi);
	const git = createPiHandoffGitGateway(commands);
	const launchToolRegistered = pi.registerTool !== undefined;
	if (launchToolRegistered) {
		pi.registerTool?.(buildClaudeHandoffLaunchTool(commands, deps));
	}
	registerCommandWithImmediateAck({
		host: pi,
		commandName: CLAUDE_HANDOFF_COMMAND_NAME,
		commandDefinition: {
			description: "Create a handoff, then pick it up in an interactive Claude Code session.",
			handler: async (args, ctx) =>
				handleClaudeHandoffCommand({ pi, args, ctx, git, launchToolRegistered }),
		},
	});
}

function canUseInteractiveClaude(ctx: BaseRuntimeContext): boolean {
	return ctx.mode === "tui" && ctx.ui.custom !== undefined;
}

function asInteractiveClaudeContext(
	ctx: BaseRuntimeContext,
): { type: "valid"; ctx: InteractiveClaudeContext } | { type: "invalid"; message: string } {
	const custom = ctx.ui.custom;
	if (ctx.mode !== "tui" || custom === undefined) {
		return {
			type: "invalid",
			message:
				"Claude handoff launch requires interactive TUI mode so the terminal can be handed to Claude Code.",
		};
	}
	return { type: "valid", ctx: { ...ctx, mode: "tui", ui: { ...ctx.ui, custom } } };
}

async function runInteractiveClaudeInStoppedTui(
	ctx: BaseRuntimeContext,
	prompt: string,
	name: string,
	deps: ClaudeHandoffDeps,
	custom: CustomUiFunction,
): Promise<InteractiveClaudeRunResult> {
	return custom<InteractiveClaudeRunResult>((tui, _theme, _keybindings, done): RenderComponent => {
		tui.stop();
		const result = deps.runClaude({ cwd: ctx.cwd, prompt, name, env: scrubClaudeEnv(deps.env) });
		tui.start();
		tui.requestRender(true);
		done(result);
		return { render: () => [], invalidate: () => {} };
	});
}

function formatClaudeExitSuffix(
	outcome: Extract<InteractiveClaudeRunResult, { type: "exited" }>,
): string {
	if (outcome.code !== null && outcome.code !== 0) {
		return ` (exit code ${outcome.code})`;
	}
	if (outcome.signal !== null) {
		return ` (signal ${outcome.signal})`;
	}
	return "";
}
