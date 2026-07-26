import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr";

export function group(): ClinkrGroupDefinition {
	return { description: "Hidden commands.", hidden: true };
}
