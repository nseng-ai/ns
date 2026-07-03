import type { CommandBackedSkillRegistration } from "@ji/pi/commands";

import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = [
	{
		skillName: objectiveCreateCommandSpec.skillName,
		surface: objectiveCreateCommandSpec.commandName,
		kind: "specialized-command",
	},
	...objectiveCommandSpecs.map((spec) => ({
		skillName: spec.skillName,
		surface: spec.commandName,
		kind: "specialized-command" as const,
	})),
] as const satisfies readonly CommandBackedSkillRegistration[];
