import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Configure Git push/fetch refspecs for Branch Memory Snapshot Refs." };
}
