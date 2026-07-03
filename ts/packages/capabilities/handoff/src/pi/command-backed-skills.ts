import { specializedCommandBackedSkill } from "@ji/pi/commands";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export const handoffCommandBackedSkillRegistrations = [
	specializedCommandBackedSkill("handoff-create", CREATE_HANDOFF_COMMAND_NAME),
	specializedCommandBackedSkill("handoff-pickup", PICKUP_HANDOFF_COMMAND_NAME),
] as const;
