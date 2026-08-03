import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Return open PRs and normalized checks for branches in one batched GitHub query.",
	};
}
