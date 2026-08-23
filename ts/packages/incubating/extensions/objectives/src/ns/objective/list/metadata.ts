import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: "List Objective records in the current checkout." };
}
