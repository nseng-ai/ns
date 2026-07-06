import { defineExtension } from "@nseng-ai/kernel/sdk";

import { harnessArtifactsNsCommand } from "../command.ts";
import {
	renderSkillsPathHuman,
	runSkillsPath,
	skillsPathRequestSchema,
	skillsPathResultSchema,
} from "../skills-path.ts";

export const skillsPathNsCommand = harnessArtifactsNsCommand({
	name: "path",
	summary: "Show where an ns skill provisions for a harness.",
	description:
		"Show the resolved target root and artifact path for a first-party ns skill in a selected harness and scope.",
	schema: skillsPathRequestSchema,
	positionals: { skill: { position: 0 } },
	options: { harness: { short: "-H" }, scope: { short: "-s" } },
	resultSchema: skillsPathResultSchema,
	handler: runSkillsPath,
	renderHuman: renderSkillsPathHuman,
});

export default defineExtension({
	commands: [skillsPathNsCommand],
});
