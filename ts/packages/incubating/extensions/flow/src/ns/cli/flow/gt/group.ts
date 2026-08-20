import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return { description: "Run Graphite-backed branch, submit, and land workflows." };
}
