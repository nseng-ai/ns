import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return { description: "Agent-only branch-context operations.", hidden: true };
}
