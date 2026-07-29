import { specializedSkillBackedCommandsFromSpecs } from "@nseng-ai/foundation/command";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export const handoffSkillBackedCommandRegistrations = specializedSkillBackedCommandsFromSpecs([
	{ skillName: "handoff-create", surface: CREATE_HANDOFF_COMMAND_NAME },
	{ skillName: "handoff-pickup", surface: PICKUP_HANDOFF_COMMAND_NAME },
]);
