import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
	};
}
