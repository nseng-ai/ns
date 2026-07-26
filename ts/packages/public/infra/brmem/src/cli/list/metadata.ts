import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"List Branch Memory Entries. Defaults to the current branch; pass --branch to override or --all-branches to include every branch.",
	};
}
