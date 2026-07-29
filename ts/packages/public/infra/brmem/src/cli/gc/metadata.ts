import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Garbage-collect Branch Memory Snapshots for missing local branches." };
}
