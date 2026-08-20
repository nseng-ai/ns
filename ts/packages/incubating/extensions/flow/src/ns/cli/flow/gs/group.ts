import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return {
		description:
			"Run branch workflows backed by the official github/gh-stack extension (CLI abbreviation: gs).",
	};
}
