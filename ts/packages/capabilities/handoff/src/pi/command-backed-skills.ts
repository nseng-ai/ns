import { specializedCommandBackedSkillsFromSpecs } from "@ji/pi/commands";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export const handoffCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "handoff-create", commandName: CREATE_HANDOFF_COMMAND_NAME },
	{ skillName: "handoff-pickup", commandName: PICKUP_HANDOFF_COMMAND_NAME },
]);
