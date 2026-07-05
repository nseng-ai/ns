import { specializedCommandBackedSkillsFromSpecs } from "@ns/core/command";

import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs(
	[objectiveCreateCommandSpec, ...objectiveCommandSpecs].map((spec) => ({
		skillName: spec.skillName,
		surface: spec.commandName,
	})),
);
