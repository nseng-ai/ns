import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Emit complete descendant topology, Git evidence, and best-effort PR metadata.",
	};
}
