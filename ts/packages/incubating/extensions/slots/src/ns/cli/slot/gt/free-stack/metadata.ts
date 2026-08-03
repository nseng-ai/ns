import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
	};
}
