import { specializedCommandBackedSkillsFromSpecs } from "@nseng-ai/foundation/command";

import { CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME } from "../api/handlers.ts";

export const cccCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "ccc-sidebar", surface: CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME },
]);
