import { formatCommand, tailText, type ExecResult } from "../command-runtime.ts";
import { expandSkillBlock, type ExpandedSkillBlock } from "../skill-expansion.ts";
import { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE } from "./identity.ts";
import type { BaseRuntimeContext, CommandContext, ExtensionAPI } from "./runtime-types.ts";

export const CREATE_HANDOFF_COMMAND_NAME = "handoff:create";
export const PICKUP_HANDOFF_COMMAND_NAME = "handoff:pickup";
export const LIST_HANDOFF_COMMAND_NAME = "handoff:list";
export const HANDOFF_TAB_COMMAND_NAME = "handoff-tab";
export const HANDOFF_TAB_LAUNCH_TOOL_NAME = "handoff_tab_launch";
export const SAVE_HANDOFF_SKILL_NAME = "handoff-save";
export const HANDOFF_TIMEOUT_MS = 30_000;
export const BRMEM_TIMEOUT_MS = 30_000;
export const GIT_TIMEOUT_MS = 10_000;
export const CMUX_TIMEOUT_MS = 10_000;
export const MAX_ERROR_CHARS = 4_000;
export const SAVE_FOCUS_QUESTION = "What should the future session continue from this handoff?";
export const HANDOFF_TAB_STATUS_KEY = HANDOFF_TAB_COMMAND_NAME;

export const SAVE_HANDOFF_FALLBACK = `Use the handoff-save workflow to save a concise, directed Markdown handoff for a specific future continuation. Treat Branch Memory as the storage command, not the public user model.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Check for an existing artifact with \`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>\`.
- Store final Markdown directly with \`brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin\`; do not create a temporary artifact file.

If review or editing is needed before saving, iterate in chat, structured UI, or another explicit surface; do not use a hidden temporary Markdown file as the review mechanism.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug, check for an existing artifact before writing, report the saved handoff first, and include branch, namespace, entry, locator/ref, and commit as technical evidence.`;

export type HandoffExistsResult = { type: "exists" } | { type: "missing" } | { type: "failed"; message: string };

export async function resolveSaveFocus(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<string | undefined> {
	const focus = rawArgs.trim();
	if (focus.length > 0) {
		return focus;
	}

	if (ctx.hasUI && ctx.ui.input !== undefined) {
		const response = await ctx.ui.input(SAVE_FOCUS_QUESTION);
		const promptedFocus = response?.trim() ?? "";
		if (promptedFocus.length > 0) {
			return promptedFocus;
		}
		ctx.ui.notify("Continuation focus is required to save a handoff.", "warning");
		return undefined;
	}

	pi.sendUserMessage(`Ask the user exactly this question before saving a handoff: ${SAVE_FOCUS_QUESTION}\n\nDo not save a handoff until the user answers with a meaningful continuation focus.`);
	return undefined;
}

export async function expandHandoffSkill(pi: Pick<ExtensionAPI, "getCommands">, skillName: string): Promise<ExpandedSkillBlock | undefined> {
	const getCommands = pi.getCommands;
	if (getCommands === undefined) {
		return undefined;
	}
	return expandSkillBlock({ getCommands: () => getCommands.call(pi) }, skillName);
}

export async function currentBranch(pi: ExtensionAPI, ctx: Pick<CommandContext, "cwd">, action: "pick up" | "list" | "save"): Promise<string> {
	const commandArgs = ["branch", "--show-current"];
	let result: ExecResult;
	try {
		result = await pi.exec("git", commandArgs, { cwd: ctx.cwd, timeout: GIT_TIMEOUT_MS });
	} catch (error) {
		throw new Error(formatStartupFailure(formatCommand("git", commandArgs), error));
	}
	if (result.code !== 0 || result.killed) {
		throw new Error(formatExecFailure(formatCommand("git", commandArgs), result));
	}

	const branch = result.stdout.trim();
	if (branch.length === 0) {
		const recovery = action === "list" ? "pass --branch <branch> or --all" : "pass --branch <branch>";
		throw new Error(`Cannot ${action} handoffs in detached HEAD; ${recovery}.`);
	}
	return branch;
}

export async function checkHandoffExists(pi: ExtensionAPI, cwd: string, branch: string, key: string): Promise<HandoffExistsResult> {
	const commandArgs = ["check", key, "--namespace", HANDOFF_NAMESPACE, "--branch", branch];
	let result: ExecResult;
	try {
		result = await pi.exec("brmem", commandArgs, { cwd, timeout: BRMEM_TIMEOUT_MS });
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("brmem", commandArgs), error) };
	}
	if (result.code === 0 && !result.killed) {
		return { type: "exists" };
	}
	if (result.code === 1 && !result.killed) {
		return { type: "missing" };
	}
	return { type: "failed", message: formatExecFailure(formatCommand("brmem", commandArgs), result) };
}

export function setStatus(ctx: BaseRuntimeContext, key: string, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(key, value);
	}
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateError(`command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`);
}

export function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return truncateError(`command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${errorMessage(error)}`);
}

export function fencedBlock(language: string, content: string): string {
	let fence = "```";
	while (content.includes(fence)) {
		fence += "`";
	}
	return `${fence}${language}\n${content.trimEnd()}\n${fence}`;
}

function truncateError(message: string): string {
	return tailText(message, { maxChars: MAX_ERROR_CHARS });
}
