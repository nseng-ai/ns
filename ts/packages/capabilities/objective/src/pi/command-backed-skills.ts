import { specializedCommandBackedSkillsFromSpecs } from "@ns/pi/commands";

import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs(
	[objectiveCreateCommandSpec, ...objectiveCommandSpecs].map((spec) => ({
		skillName: spec.skillName,
		surface: spec.commandName,
	})),
);
