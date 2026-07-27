import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Fixture command.", summary: "Fixture summary.", aliases: ["fx"] };
}
