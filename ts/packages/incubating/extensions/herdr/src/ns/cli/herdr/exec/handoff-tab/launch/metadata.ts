import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Launch a stored handoff in a focused Herdr tab.",
		description:
			"Verify a stored handoff reference, create a focused Herdr tab, and launch pickup in its root pane.",
	};
}
