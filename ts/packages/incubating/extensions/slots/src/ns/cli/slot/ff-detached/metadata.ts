import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Fast-forward detached Slots to the configured trunk without modifying attached Slots.",
	};
}
