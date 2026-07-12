import { specializedCommandBackedSkillsFromSpecs } from "@nseng-ai/foundation/command";

import { CMUX_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME } from "../api/handlers.ts";

export const cmuxCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "ns-cmux-sidebar", surface: CMUX_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME },
]);
