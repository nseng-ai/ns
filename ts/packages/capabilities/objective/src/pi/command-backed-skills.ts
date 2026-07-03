import { specializedCommandBackedSkill } from "@ji/pi/commands";

import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = [
	specializedCommandBackedSkill(
		objectiveCreateCommandSpec.skillName,
		objectiveCreateCommandSpec.commandName,
	),
	...objectiveCommandSpecs.map((spec) =>
		specializedCommandBackedSkill(spec.skillName, spec.commandName),
	),
] as const;
