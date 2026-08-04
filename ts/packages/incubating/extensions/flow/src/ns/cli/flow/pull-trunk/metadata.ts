import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Pull the Git trunk branch identified by cached refs/remotes/origin/HEAD from its configured upstream without running full gt sync.",
		summary: "Pull the Git trunk branch from its configured upstream without running full gt sync.",
	};
}
