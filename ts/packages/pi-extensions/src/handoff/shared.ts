import { runAvailableBrmemCommand } from "@asdl/core/brmem-cli";
import { formatCommand, tailText, type ExecResult } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE } from "@asdl/handoff/identity";
import { parseMachineEnvelopeData } from "@asdl/pi-extension-runtime/machine-envelope";
import { expandRepoSkillBlock, type ExpandedSkillBlock } from "../skill-expansion.ts";
import type { BaseRuntimeContext, CommandContext, ExtensionAPI } from "./runtime-types.ts";

export const CREATE_HANDOFF_COMMAND_NAME = "handoff:create";
export const PICKUP_HANDOFF_COMMAND_NAME = "handoff:pickup";
export const LIST_HANDOFF_COMMAND_NAME = "handoff:list";
export const HANDOFF_TAB_COMMAND_NAME = "ccc:handoff-tab";
export const HANDOFF_SELF_COMMAND_NAME = "handoff:self";
export const DERIVE_HANDOFF_SLUG_TOOL_NAME = "derive_handoff_slug_from_content";
export const HANDOFF_TAB_LAUNCH_TOOL_NAME = "handoff_tab_launch";
export const HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME = "handoff_self_queue_pickup";
export const CREATE_HANDOFF_SKILL_NAME = "handoff-create";
export const HANDOFF_TIMEOUT_MS = 30_000;
export const BRMEM_TIMEOUT_MS = 30_000;
// Long enough for the model to compose and store a full handoff before resolving session replacement.
export const HANDOFF_SELF_WORKFLOW_TIMEOUT_MS = 10 * 60_000;
export const GIT_TIMEOUT_MS = 10_000;
export const CMUX_TIMEOUT_MS = 10_000;
export const MAX_ERROR_CHARS = 4_000;
export const CREATE_FOCUS_QUESTION = "What should the future session continue from this handoff?";
export const HANDOFF_TAB_STATUS_KEY = HANDOFF_TAB_COMMAND_NAME;
export const HANDOFF_SELF_STATUS_KEY = HANDOFF_SELF_COMMAND_NAME;

export const CREATE_HANDOFF_FALLBACK = `Use the handoff-create workflow to create a concise, directed Markdown handoff for a specific future continuation. Treat Branch Memory as the storage command, not the public user model.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Compose the final Markdown handoff content first, then derive \`<semantic-slug>\` from that final content unless the user provided an explicit specific slug/key.
- Check for an existing artifact with \`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>\`.
- Store final Markdown directly with \`brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin\`; do not create a temporary artifact file.

If review or editing is needed before creating, iterate in chat, structured UI, or another explicit surface; do not use a hidden temporary Markdown file as the review mechanism.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug based on the final artifact body, check for an existing artifact before writing, report the created handoff first, and include branch, namespace, entry, locator/ref, and commit as technical evidence.`;

export type HandoffExistsResult = { type: "exists" } | { type: "missing" } | { type: "failed"; message: string };

export interface HandoffStartMessages {
	ready: string;
	fallbackLabel: string;
}

export async function resolveCreateFocus(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<string | undefined> {
	const focus = rawArgs.trim();
	if (focus.length > 0) {
		return focus;
	}

	if (ctx.hasUI && ctx.ui.input !== undefined) {
		const response = await ctx.ui.input(CREATE_FOCUS_QUESTION);
		const promptedFocus = response?.trim() ?? "";
		if (promptedFocus.length > 0) {
			return promptedFocus;
		}
		ctx.ui.notify("Continuation focus is required to create a handoff.", "warning");
		return undefined;
	}

	pi.sendUserMessage(`Ask the user exactly this question before creating a handoff: ${CREATE_FOCUS_QUESTION}\n\nDo not create a handoff until the user answers with a meaningful continuation focus.`);
	return undefined;
}

export async function expandHandoffSkill(cwd: string, skillName: string): Promise<ExpandedSkillBlock | undefined> {
	try {
		return await expandRepoSkillBlock({ cwd, skillName });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.startsWith("Could not find ")) {
			return undefined;
		}
		throw error;
	}
}

export async function currentBranch(pi: ExtensionAPI, ctx: Pick<CommandContext, "cwd">, action: "pick up" | "list" | "create"): Promise<string> {
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
	const brmemArgs = ["check", key, "--namespace", HANDOFF_NAMESPACE, "--branch", branch, "--format", "json"];
	const run = await runAvailableBrmemCommand({ gateway: pi, cwd, brmemArgs, timeoutMs: BRMEM_TIMEOUT_MS });
	if (!run.ok) {
		return { type: "failed", message: run.error.message };
	}
	const result = run.value.result;
	if (result.code === 0 && !result.killed) {
		return { type: "exists" };
	}
	if (result.code === 1 && !result.killed && isBrmemMissingEnvelope(result.stdout)) {
		return { type: "missing" };
	}
	return {
		type: "failed",
		message: `brmem check failed before it could verify the handoff.\n\n${formatExecFailure(run.value.displayCommand, result)}`,
	};
}

export function setStatus(ctx: BaseRuntimeContext, key: string, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(key, value);
	}
}

export function createHandoffStartMessage(
	messages: HandoffStartMessages,
	skill: Awaited<ReturnType<typeof expandHandoffSkill>>,
	skillReadError: string | undefined,
): string {
	if (skill !== undefined) {
		return messages.ready;
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback ${messages.fallbackLabel}. ${skillReadError}`;
	}
	return `handoff-create skill was not found; using fallback ${messages.fallbackLabel}.`;
}

export function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateError(`command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`);
}

function isBrmemMissingEnvelope(stdout: string): boolean {
	const envelope = parseMachineEnvelopeData(stdout, { label: "brmem check JSON", stdoutTail: false });
	return envelope.type === "failure" && envelope.exitCode === 1;
}

export function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return truncateError(`command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${formatErrorMessage(error)}`);
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
