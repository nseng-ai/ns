import { resolveCreateFocus } from "./create-focus.ts";
import { CREATE_HANDOFF_FALLBACK } from "./create-prompt.ts";
import { buildFencedTextBlock } from "@ji/pi/skills/expansion";
import { realHandoffCreateSkillLoader } from "./create-skill.ts";
import { createHandoffStartMessage, type HandoffStartMessages } from "./ui-status.ts";
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

${buildFencedTextBlock(focusText)}

Treat this as an explicit request to run the handoff create workflow. The handoff must be directed toward the supplied continuation focus. Compose the final Markdown handoff artifact first, then derive a semantic slug from that final content unless the user explicitly supplied one. Avoid overwriting an existing artifact unless replacement was explicitly requested, and keep normal copy focused on creating/picking up a handoff.

Before writing, confirm the branch unless the user explicitly named one and derive the slug from the final artifact content. Do not create a temporary Markdown file; store final Markdown directly through /dev/stdin with the Handoff command:

${buildFencedTextBlock(
	`ji handoff create --slug <semantic-slug> --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF`,
	"bash",
)}

The command refuses existing artifacts by default; if it reports a collision, stop and ask before replacing anything. Report the created handoff first. Include Branch Memory details only as technical storage evidence.`;
}

export async function handleCreateHandoffCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	const loadedSkill = await realHandoffCreateSkillLoader.loadCreateHandoffSkill(ctx.cwd);
	const skill = loadedSkill.type === "found" ? loadedSkill.skill : undefined;
	const skillReadError = loadedSkill.type === "failed" ? loadedSkill.message : undefined;

	if (ctx.hasUI) {
		ctx.ui.notify(
			createHandoffStartMessage(CREATE_HANDOFF_START_MESSAGES, skill, skillReadError),
			skill ? "info" : "warning",
		);
	}
	pi.sendUserMessage(buildCreateHandoffPrompt(skill?.block, focus));
}
