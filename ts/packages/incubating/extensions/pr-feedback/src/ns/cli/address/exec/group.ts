import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return { description: "Agent-only GitHub pull request feedback operations.", hidden: true };
}
