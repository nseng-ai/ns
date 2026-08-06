import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Internal flow exec operation. Reads and validates Graphite branch metadata through a controlled sqlite3 query.",
		summary: "Read Graphite branch metadata for flow internals.",
	};
}
