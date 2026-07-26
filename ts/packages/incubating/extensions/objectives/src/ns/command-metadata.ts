import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function objectiveCommandMetadata(
	description: string,
	overrides: Omit<ClinkrCommandMetadata, "description"> = {},
): ClinkrCommandMetadata {
	return { description, summary: description, ...overrides };
}
