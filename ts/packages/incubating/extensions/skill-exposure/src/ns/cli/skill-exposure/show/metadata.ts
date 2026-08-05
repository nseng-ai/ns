import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Show retained exposure policy for explicit skill paths.",
		description: "Inspect one or more explicit skill directories or direct SKILL.md paths.",
	};
}
