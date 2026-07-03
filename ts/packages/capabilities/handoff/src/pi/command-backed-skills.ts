import { specializedCommandBackedSkillsFromSpecs } from "@ns/pi/commands";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export const handoffCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "handoff-create", surface: CREATE_HANDOFF_COMMAND_NAME },
	{ skillName: "handoff-pickup", surface: PICKUP_HANDOFF_COMMAND_NAME },
]);
