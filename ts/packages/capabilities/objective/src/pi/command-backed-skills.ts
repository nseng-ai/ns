import { specializedCommandBackedSkillsFromSpecs } from "@ji/pi/commands";

import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	objectiveCreateCommandSpec,
	...objectiveCommandSpecs,
]);
