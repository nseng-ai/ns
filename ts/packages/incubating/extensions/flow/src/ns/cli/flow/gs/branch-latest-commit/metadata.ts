import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Move the latest eligible commit to a new child with the official github/gh-stack extension. Untracked non-trunk sources are initialized; untracked Git trunk and non-top sources are refused before destructive mutation.",
		summary: "Move the latest commit to a github/gh-stack child branch.",
	};
}
