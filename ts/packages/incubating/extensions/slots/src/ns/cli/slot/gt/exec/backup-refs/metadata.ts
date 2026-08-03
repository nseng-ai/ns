import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Create timestamped local backup refs for branches before destructive stack surgery.",
	};
}
