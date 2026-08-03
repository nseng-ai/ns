import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "List active Objective slug candidates for shell and agent autocomplete.",
	};
}
