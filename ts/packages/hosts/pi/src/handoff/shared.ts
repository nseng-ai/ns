import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	type ExecResult,
} from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	checkHandoffArtifact,
	handoffKeyToSlug,
} from "@sdl/handoff/api";
import { expandRepoSkillBlock, type ExpandedSkillBlock } from "../skills/expansion.ts";
import { createPiHandoffStorageDeps } from "./api-context.ts";
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
export const CREATE_FOCUS_QUESTION = "What should the future session continue from this handoff?";
export const HANDOFF_TAB_STATUS_KEY = HANDOFF_TAB_COMMAND_NAME;
export const HANDOFF_SELF_STATUS_KEY = HANDOFF_SELF_COMMAND_NAME;

export const CREATE_HANDOFF_FALLBACK = `Use the handoff-create workflow to create a concise, directed Markdown handoff for a specific future continuation. Treat Branch Memory as the storage command, not the public user model.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Compose the final Markdown handoff content first, then derive \`<semantic-slug>\` from that final content unless the user provided an explicit specific slug/key.
- Store final Markdown with \`sdl handoff create --slug <semantic-slug> --branch <branch> --file /dev/stdin\`; do not create a temporary artifact file.
- If \`sdl handoff create\` is unavailable, the Branch Memory recovery path is \`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>\` followed by \`brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin\`.

If review or editing is needed before creating, iterate in chat, structured UI, or another explicit surface; do not use a hidden temporary Markdown file as the review mechanism.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug based on the final artifact body, check for an existing artifact before writing, report the created handoff first, and include branch, namespace, entry, locator/ref, and commit as technical evidence.`;

export type HandoffExistsResult =
	| { type: "exists" }
	| { type: "missing" }
	| { type: "failed"; message: string };
export type HandoffCreateSkillLoadResult =
	| { type: "found"; skill: ExpandedSkillBlock }
	| { type: "missing" }
	| { type: "failed"; message: string };

export interface HandoffCreateSkillLoader {
	loadCreateHandoffSkill(cwd: string): Promise<HandoffCreateSkillLoadResult>;
}

export interface HandoffStartMessages {
	ready: string;
	fallbackLabel: string;
}

export async function resolveCreateFocus(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
): Promise<string | undefined> {
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

	pi.sendUserMessage(
		`Ask the user exactly this question before creating a handoff: ${CREATE_FOCUS_QUESTION}\n\nDo not create a handoff until the user answers with a meaningful continuation focus.`,
	);
	return undefined;
}

export const realHandoffCreateSkillLoader = {
	async loadCreateHandoffSkill(cwd: string): Promise<HandoffCreateSkillLoadResult> {
		try {
			const skill = await expandHandoffSkill(cwd, CREATE_HANDOFF_SKILL_NAME);
			if (skill === undefined) {
				return { type: "missing" };
			}
			return { type: "found", skill };
		} catch (error) {
			return { type: "failed", message: formatErrorMessage(error) };
		}
	},
} satisfies HandoffCreateSkillLoader;

export async function expandHandoffSkill(
	cwd: string,
	skillName: string,
): Promise<ExpandedSkillBlock | undefined> {
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

export async function currentBranch(
	pi: ExtensionAPI,
	ctx: Pick<CommandContext, "cwd">,
	action: "pick up" | "list" | "create",
): Promise<string> {
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
		const recovery =
			action === "list" ? "pass --branch <branch> or --all" : "pass --branch <branch>";
		throw new Error(`Cannot ${action} handoffs in detached HEAD; ${recovery}.`);
	}
	return branch;
}

export async function checkHandoffExists(
	pi: ExtensionAPI,
	cwd: string,
	branch: string,
	key: string,
): Promise<HandoffExistsResult> {
	const result = await checkHandoffArtifact(createPiHandoffStorageDeps(pi, cwd), {
		branch,
		slug: handoffKeyToSlug(key),
	});
	if (result.type === "error") {
		return { type: "failed", message: result.error.message };
	}
	return result.value.exists ? { type: "exists" } : { type: "missing" };
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
	return formatCommandFailure("command failed", commandDisplay, result);
}

export function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return formatCommandStartupFailure("command failed", commandDisplay, error);
}

export function fencedBlock(language: string, content: string): string {
	let fence = "```";
	while (content.includes(fence)) {
		fence += "`";
	}
	return `${fence}${language}\n${content.trimEnd()}\n${fence}`;
}
