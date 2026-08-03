import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Reply to and/or resolve GitHub PR review threads in bulk." };
}
