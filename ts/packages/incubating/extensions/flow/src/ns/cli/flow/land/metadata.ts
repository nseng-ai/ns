import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Land the current PR or Graphite stack into trunk.",
		summary: "Land the current PR or Graphite stack into trunk.",
	};
}
