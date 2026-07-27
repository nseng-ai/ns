import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Renderer that always emits ANSI regardless of capabilities." };
}
