import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Create and load branch-scoped implementation context.",
	commandDirectory: `${import.meta.dirname}/cli`,
	points: [
		{
			id: "branch-context.plans-write",
			accepts: "prompt",
			cardinality: "one",
			description: "Custom prompt body for saved-plan authoring.",
			default:
				"../../../hosts/pi/extensions/pi-ns-branch-context/src/prompts/plans-write-default.md",
		},
	],
});
