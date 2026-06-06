import { expandSkillBlock } from "./skill-expansion.ts";

const ARETRO_BRANCH_RETRO_COMMAND_NAME = "aretro:branch-retro";
const BRANCH_RETRO_SKILL_NAME = "branch-retro";

export type NotifyLevel = "info" | "warning" | "error";

interface CommandInfo {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
}

export interface CommandContext {
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	getCommands(): readonly CommandInfo[];
	sendUserMessage(content: string): void;
}

function fallbackBranchRetroPrompt(): string {
	return `The branch-retro skill was not found among loaded Pi skills. Follow the repository's branch retrospective workflow anyway: collect deterministic evidence with \`aretro exec collect-evidence --format json\`, interpret factual evidence items semantically, keep the default mode read-only, do not quote raw prompts/tool output/command output, and ask before applying follow-up recommendations.`;
}

function buildBranchRetroPrompt(skillBlock: string | undefined, args: string): string {
	const trimmedArgs = args.trim();
	const request = trimmedArgs || "Run a branch/session retrospective for the current repository and branch.";
	return `${skillBlock ?? fallbackBranchRetroPrompt()}

User: ${request}`;
}

async function handleBranchRetroCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkillBlock(pi, BRANCH_RETRO_SKILL_NAME);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `Invoking /${ARETRO_BRANCH_RETRO_COMMAND_NAME} via ${BRANCH_RETRO_SKILL_NAME}.`
				: `${BRANCH_RETRO_SKILL_NAME} skill was not found; using fallback prompt.`,
			skill ? "info" : "warning",
		);
	}

	pi.sendUserMessage(buildBranchRetroPrompt(skill?.block, args));
}

export default function aretroExtension(pi: ExtensionAPI): void {
	pi.registerCommand(ARETRO_BRANCH_RETRO_COMMAND_NAME, {
		description:
			"Invoke the branch-retro skill to collect aretro evidence and write a read-only semantic branch/session retrospective.",
		handler: async (args, ctx) => handleBranchRetroCommand(pi, args, ctx),
	});
}
