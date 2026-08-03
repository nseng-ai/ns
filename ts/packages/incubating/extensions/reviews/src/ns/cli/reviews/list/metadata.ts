import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "List configured Reviews review definitions.",
		description: `List configured Reviews review definitions.

This ns command adapts ns execution context to Reviews gateway-injected runtime, then delegates through the curated @nseng-ai/reviews/api facade. Discovery and group help read only manifest metadata; selected help loads this command for its schema and detailed description without running git, Branch Memory, model, or GitHub operations.`,
	};
}
