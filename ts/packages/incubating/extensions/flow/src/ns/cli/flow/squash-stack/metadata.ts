import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Squash every branch in the current Graphite stack from the tip down, then restore the tip branch.",
		summary: "Squash every branch in the current Graphite stack to one commit.",
	};
}
