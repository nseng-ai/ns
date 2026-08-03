import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return { description: "Run configured code reviews and publish findings." };
}
