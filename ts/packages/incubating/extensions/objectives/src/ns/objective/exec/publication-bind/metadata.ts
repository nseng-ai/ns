import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Bind one parent-held Objective Runner publication authorization to the current branch and existing pull request.",
	};
}
