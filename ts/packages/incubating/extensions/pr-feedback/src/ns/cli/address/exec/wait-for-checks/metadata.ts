import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Wait until the branches' open-PR checks settle (failures reported as soon as observed) and return the outcome once.",
	};
}
