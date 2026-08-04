import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Emit deterministic Git, Graphite, and Slot facts before a restack." };
}
