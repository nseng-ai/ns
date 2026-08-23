import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Configure Git push/fetch refspecs for Branch Memory Snapshot Refs." };
}
