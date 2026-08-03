import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Emit the current Graphite stack branch list for skill/agent invocation." };
}
