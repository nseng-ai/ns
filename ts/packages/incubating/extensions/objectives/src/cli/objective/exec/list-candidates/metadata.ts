import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "List active Objective slug candidates for shell and agent autocomplete.",
	};
}
