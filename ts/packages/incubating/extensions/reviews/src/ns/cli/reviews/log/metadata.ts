import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "List Reviews review logs for this branch.",
		description:
			"List Branch Memory review log entries for this branch, optionally filtered by review key.",
	};
}
