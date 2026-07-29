import { definePiSurfaceParity, type PiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

import { genericSkillBackedCommandSpecs } from "./specs.ts";

export const skillBackedCommandsParity = definePiSurfaceParity(
	genericSkillBackedCommandSpecs().map(
		(spec): PiSurfaceParity => ({
			kind: "command",
			surface: spec.surface,
			workflow: `Invoke ${spec.skillName} as a skill-backed command`,
			parity: "FULL",
			skill: spec.skillName,
			cli: "n/a: skill-backed commands are the agent-neutral route",
			ownerObjective: "cross-harness-parity",
			sourcePackage: "@internal/pi-tools/skill-backed-commands",
			sourceModule: "skill-backed-commands",
			notes:
				"Generated from the same command-style skill inventory used for live command registration.",
		}),
	),
);
