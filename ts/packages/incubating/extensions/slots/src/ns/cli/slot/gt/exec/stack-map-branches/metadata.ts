import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
	};
}
