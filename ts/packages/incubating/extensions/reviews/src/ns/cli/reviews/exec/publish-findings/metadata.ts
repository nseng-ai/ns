import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Publish Reviews findings to GitHub.",
		description: `Publish Reviews findings to GitHub.

This hidden ns automation command preserves Reviews review-run envelope stdin contract: it reads a review-run Clinkr envelope from stdin, publishes inline and summary findings through Reviews gateway-injected GitHub publication boundary, and returns an enveloped publication result. It keeps diagnostics on stderr for automation logs and does not prompt for confirmation.`,
	};
}
