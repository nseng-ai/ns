import { specializedCommandBackedSkillsFromSpecs } from "@nseng-ai/foundation/command";

import { allObjectiveCreateCommandSpecs, objectiveCommandSpecs } from "../api/index.ts";

export const objectiveCommandBackedSkillRegistrations = [
	{
		skillName: "objective-list",
		surface: "ns:objective:list",
		kind: "specialized-command",
	},
	...specializedCommandBackedSkillsFromSpecs(
		[...allObjectiveCreateCommandSpecs, ...objectiveCommandSpecs].map((spec) => ({
			skillName: spec.skillName,
			surface: spec.commandName,
		})),
	),
] as const;
