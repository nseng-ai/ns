import { specializedCommandBackedSkillsFromSpecs } from "@nseng-ai/foundation/command";

import { allObjectiveCreateCommandSpecs, objectiveCommandSpecs } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs([
	{ skillName: "objective-list", surface: "ns:objective:list" },
	...[...allObjectiveCreateCommandSpecs, ...objectiveCommandSpecs].map((spec) => ({
		skillName: spec.skillName,
		surface: spec.commandName,
	})),
]);
