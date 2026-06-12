import { formatErrorMessage } from "@asdl/core/primitives";

import {
	formatHandoffPickupCommand,
	listHandoffItems,
	previewHandoffItems,
	type HandoffListItem,
	type HandoffListMessageItem,
} from "../handoff.ts";
import {
	CREATE_HANDOFF_SKILL_NAME,
	currentBranch,
	fencedBlock,
	setStatus,
} from "../handoff/shared.ts";
import type { CommandContext, ExtensionAPI } from "../handoff/runtime-types.ts";

export const CLAUDE_HANDOFF_COMMAND_NAME = "claude:handoff";

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

export function scrubClaudeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const scrubbed = { ...env };
	delete scrubbed.ANTHROPIC_API_KEY;
	delete scrubbed.ANTHROPIC_AUTH_TOKEN;
	return scrubbed;
}

export function buildClaudeSeedPrompt(branch: string, rawArgs: string): string {
	const focus = rawArgs.trim();
	const focusInstructions =
		focus.length === 0
			? "Ask the user for the continuation focus first. Do not create the handoff until the user gives a meaningful focus."
			: `Use this continuation focus:\n\n${fencedBlock("text", focus)}`;

	return `Use the installed ${CREATE_HANDOFF_SKILL_NAME} skill to create a directed handoff artifact, then exit Claude Code after reporting the result.

Store the handoff on branch ${branch}. The branch is load-bearing: Pi will verify creation by diffing handoffs on exactly this branch after you exit.

${focusInstructions}

Follow the ${CREATE_HANDOFF_SKILL_NAME} skill's storage contract. Do not use a hidden temporary artifact file; store the final Markdown handoff through Branch Memory as the skill directs.`;
}

export function diffNewHandoffItems(before: readonly HandoffListItem[], after: readonly HandoffListItem[]): HandoffListItem[] {
	const beforeKeys = new Set(before.map((item) => item.key));
	return after.filter((item) => !beforeKeys.has(item.key));
}

export async function handleClaudeHandoffCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	deps: ClaudeHandoffDeps,
): Promise<void> {
	if (ctx.mode !== "tui" || ctx.ui.custom === undefined) {
		ctx.ui.notify("/claude:handoff requires interactive TUI mode so the terminal can be handed to Claude Code.", "error");
		return;
	}

	await ctx.waitForIdle();

	let branch: string;
	try {
		branch = await currentBranch(pi, ctx, "create");
	} catch (error) {
		ctx.ui.notify(formatErrorMessage(error), "error");
		return;
	}

	let beforeItems: HandoffListItem[];
	setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, "snapshotting handoffs…");
	try {
		const beforeResult = await listHandoffItems(pi, ctx, { branch });
		if (beforeResult.type === "failed") {
			ctx.ui.notify(beforeResult.message, "error");
			return;
		}
		beforeItems = beforeResult.items;
	} finally {
		setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, undefined);
	}

	const prompt = buildClaudeSeedPrompt(branch, args);
	const outcome = await ctx.ui.custom<InteractiveClaudeRunResult>((tui, _theme, _keybindings, done) => {
		tui.stop();
		const result = deps.runClaude({ cwd: ctx.cwd, prompt, env: scrubClaudeEnv(deps.env) });
		tui.start();
		tui.requestRender(true);
		done(result);
		return { render: () => [], invalidate: () => {} };
	});

	if (outcome.type === "spawn-failed") {
		ctx.ui.notify(`Failed to launch Claude Code: ${outcome.message}. Is Claude Code installed and on PATH?`, "error");
		return;
	}

	let afterItems: HandoffListItem[];
	setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, "checking for new handoffs…");
	try {
		const afterResult = await listHandoffItems(pi, ctx, { branch });
		if (afterResult.type === "failed") {
			ctx.ui.notify(
				`Claude exited${formatClaudeExitSuffix(outcome)}, but listing handoffs failed; could not verify whether a handoff was created. ${afterResult.message}`,
				"error",
			);
			return;
		}
		afterItems = afterResult.items;
	} finally {
		setStatus(ctx, CLAUDE_HANDOFF_COMMAND_NAME, undefined);
	}

	const newItems = diffNewHandoffItems(beforeItems, afterItems);
	if (newItems.length === 0) {
		ctx.ui.notify(`Claude exited without creating a new handoff${formatClaudeExitSuffix(outcome)}.`, "warning");
		return;
	}

	const previewedItems = await previewHandoffItems(pi, ctx, newItems);
	for (const item of previewedItems) {
		ctx.ui.notify(formatCreatedHandoffMessage(item), "info");
	}
}

export function registerClaudeHandoffCommand(pi: ExtensionAPI, deps: ClaudeHandoffDeps): void {
	pi.registerCommand(CLAUDE_HANDOFF_COMMAND_NAME, {
		description: "Author a handoff in an interactive Claude Code session.",
		handler: async (args, ctx) => handleClaudeHandoffCommand(pi, args, ctx, deps),
	});
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

function formatCreatedHandoffMessage(item: HandoffListMessageItem): string {
	return `Created handoff ${item.slug} — ${item.preview}. Pick up with ${formatHandoffPickupCommand(item, "branch")}.`;
}
