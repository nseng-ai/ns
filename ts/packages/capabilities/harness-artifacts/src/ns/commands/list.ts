import { defineExtension } from "@nseng-ai/kernel/sdk";

import { harnessArtifactsNsCommand } from "../command.ts";
import {
	renderSkillsListHuman,
	runSkillsList,
	skillsListRequestSchema,
	skillsListResultSchema,
} from "../skills-list.ts";

export const skillsListNsCommand = harnessArtifactsNsCommand({
	name: "list",
	summary: "List first-party ns skills.",
	description: "List first-party ns-owned skills available for harness provisioning.",
	schema: skillsListRequestSchema,
	resultSchema: skillsListResultSchema,
	handler: () => runSkillsList(),
	renderHuman: renderSkillsListHuman,
});

export default defineExtension({
	commands: [skillsListNsCommand],
});
