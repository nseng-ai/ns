import { formatErrorMessage } from "@asdl/core/primitives";
import { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE } from "@asdl/handoff/identity";

import {
	CREATE_HANDOFF_COMMAND_NAME,
	CREATE_HANDOFF_FALLBACK,
	CREATE_HANDOFF_SKILL_NAME,
	createHandoffStartMessage,
	expandHandoffSkill,
	fencedBlock,
	resolveCreateFocus,
	type HandoffStartMessages,
} from "./shared.ts";
import type { CommandContext, ExtensionAPI } from "./runtime-types.ts";

const CREATE_HANDOFF_START_MESSAGES = {
	ready: "Starting handoff create workflow…",
	fallbackLabel: "handoff-create workflow prompt",
} satisfies HandoffStartMessages;

export function buildCreateHandoffPrompt(skillBlock: string | undefined, focus: string): string {
	const focusText = focus.trim();
	return `${skillBlock ?? CREATE_HANDOFF_FALLBACK}

Create a directed handoff artifact for this session.

Continuation focus:

${fencedBlock("text", focusText)}

Treat this as an explicit request to run the handoff create workflow. The handoff must be directed toward the supplied continuation focus. Compose the final Markdown handoff artifact first, then derive a semantic slug from that final content unless the user explicitly supplied one. Avoid overwriting an existing artifact unless replacement was explicitly requested, and keep normal copy focused on creating/picking up a handoff.

Before writing, confirm the branch unless the user explicitly named one, derive the slug from the final artifact content, and check for an existing key. Do not create a temporary Markdown file; store final Markdown directly through /dev/stdin:

${fencedBlock(
		"bash",
		`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>
brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF`,
	)}

Report the created handoff first. Include Branch Memory details only as technical storage evidence.`;
}

export async function handleCreateHandoffCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	let skill: Awaited<ReturnType<typeof expandHandoffSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandHandoffSkill(ctx.cwd, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = formatErrorMessage(error);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(createHandoffStartMessage(CREATE_HANDOFF_START_MESSAGES, skill, skillReadError), skill ? "info" : "warning");
	}
	pi.sendUserMessage(buildCreateHandoffPrompt(skill?.block, focus));
}

export const createHandoffCommandDescription = {
	name: CREATE_HANDOFF_COMMAND_NAME,
	description: "Create a directed handoff artifact for a future continuation.",
} as const;
