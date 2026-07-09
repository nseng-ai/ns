import { harnessArtifactsNsCommand } from "../command.ts";
import {
	renderSkillsInstallHuman,
	runSkillsInstall,
	skillsInstallCommandResultSchema,
	skillsInstallRequestSchema,
} from "../skills-install.ts";

export const skillsInstallNsCommand = harnessArtifactsNsCommand({
	name: "install",
	summary: "Provision an ns skill into a harness.",
	description:
		"Deterministically preview or provision a first-party ns skill into a selected harness and scope.",
	schema: skillsInstallRequestSchema,
	positionals: { skill: { position: 0 } },
	options: {
		harness: { short: "-H" },
		scope: { short: "-s" },
		dryRun: { short: "-n" },
		force: { short: "-f" },
	},
	resultSchema: skillsInstallCommandResultSchema,
	handler: runSkillsInstall,
	renderHuman: renderSkillsInstallHuman,
});

export default skillsInstallNsCommand;
