import type { CommandBackedSkillRegistration } from "@ji/pi/commands";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export const handoffCommandBackedSkillRegistrations = [
	{
		skillName: "handoff-create",
		surface: CREATE_HANDOFF_COMMAND_NAME,
		kind: "specialized-command",
	},
	{
		skillName: "handoff-pickup",
		surface: PICKUP_HANDOFF_COMMAND_NAME,
		kind: "specialized-command",
	},
] as const satisfies readonly CommandBackedSkillRegistration[];
