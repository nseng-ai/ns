import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Move dirty work onto a GS child and checkpoint it.",
		description:
			"Create a child from dirty cached trunk or extend the invoking provider worktree's tracked top. Requires gh-stack 0.1.0 and --yes for non-interactive mutation.",
	};
}
