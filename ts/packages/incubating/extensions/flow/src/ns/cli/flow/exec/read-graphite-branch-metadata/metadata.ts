import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Internal flow exec operation. Reads Graphite branch metadata through a controlled sqlite3 query and prints the raw JSON row array.",
		summary: "Read Graphite branch metadata for flow internals.",
	};
}
