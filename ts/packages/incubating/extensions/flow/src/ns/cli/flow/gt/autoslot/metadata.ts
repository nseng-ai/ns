import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Create a Graphite branch from current work, then move it into a managed slot worktree.",
		summary:
			"Create a Graphite branch from current work, then move it into a managed slot worktree.",
	};
}
