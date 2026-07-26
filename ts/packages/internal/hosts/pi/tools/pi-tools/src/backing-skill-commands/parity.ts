import { definePiSurfaceParity, type PiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

import { genericBackingSkillCommandSpecs } from "./specs.ts";

export const backingSkillCommandsParity = definePiSurfaceParity(
	genericBackingSkillCommandSpecs().map(
		(spec): PiSurfaceParity => ({
			kind: "command",
			surface: spec.surface,
			workflow: `Invoke ${spec.skillName} as a command-converted backing skill`,
			parity: "FULL",
			skill: spec.skillName,
			cli: "n/a: backing skills are the agent-neutral route",
			ownerObjective: "cross-harness-parity",
			sourcePackage: "@internal/pi-tools/backing-skill-commands",
			sourceModule: "backing-skill-commands",
			notes:
				"Generated from the same command-style skill inventory used for live command registration.",
		}),
	),
);
