import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Record same-session Reviews findings from stdin.",
		description: `Record same-session Reviews findings from stdin.

This hidden ns automation command preserves Reviews record-findings JSON stdin contract, validates the findings payload inside Reviews-owned logic, and writes the same Branch Memory review log under namespace reviews and reviews/<review-key>/... keys. It intentionally does not publish findings to GitHub.`,
	};
}
