import { specializedSkillBackedCommandsFromSpecs } from "@nseng-ai/foundation/command";

import { nsFlowCommandSurface } from "./ns-extension.ts";

export const flowSkillBackedCommandRegistrations = specializedSkillBackedCommandsFromSpecs([
	{ skillName: "ns-flow-autobranch", surface: nsFlowCommandSurface("autobranch") },
	{
		skillName: "ns-flow-branch-latest-commit",
		surface: nsFlowCommandSurface("branch-latest-commit"),
	},
	{ skillName: "ns-flow-cp", surface: nsFlowCommandSurface("cp") },
	{ skillName: "ns-flow-submit", surface: nsFlowCommandSurface("submit") },
]);
