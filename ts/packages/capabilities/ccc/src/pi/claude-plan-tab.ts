import { registerCommandWithImmediateAck } from "@ns/pi/commands/ack";
import {
	CCC_CLAUDE_PLAN_TAB_COMMAND_NAME,
	handleCccClaudePlanTab,
	type PromptFileOptions,
	resolvePromptFileOptions,
} from "../api/handlers.ts";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";

const COMMAND_NAME = CCC_CLAUDE_PLAN_TAB_COMMAND_NAME;
const PROMPT_DIR = join(homedir(), ".pi", "agent", "ccc-claude-plan-tab-prompts");

export function registerCccClaudePlanTabCommand(
	pi: ExtensionAPI,
	options: PromptFileOptions = {},
): void {
	const promptOptions = resolvePromptFileOptions(options, PROMPT_DIR);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Open a new cmux tab running Claude Code in plan mode, seeded with the provided prompt or last assistant message.",
			argumentHint: "[seed prompt]",
			handler: async (args, ctx) => {
				await handleCccClaudePlanTab({ pi, ctx, args, promptOptions });
			},
		},
	});
}
