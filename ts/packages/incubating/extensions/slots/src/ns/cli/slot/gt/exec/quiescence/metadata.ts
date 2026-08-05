import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Preflight whether the current Graphite stack scope is safe to mutate." };
}
