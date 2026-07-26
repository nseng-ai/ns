import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr";

export function group(): ClinkrGroupDefinition {
	return { description: "Agent-only Objective operations.", hidden: true };
}
