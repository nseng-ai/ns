import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return {
		description: "Commands for use by skills (not interactive users).",
		hidden: true,
	};
}
