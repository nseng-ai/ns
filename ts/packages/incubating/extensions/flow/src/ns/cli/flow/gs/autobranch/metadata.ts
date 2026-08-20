import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Create a branch with the official github/gh-stack extension from dirty worktree changes. An untracked non-trunk source is initialized with `gh stack init <source>`; an untracked Git trunk is refused before mutation.",
		summary: "Create a github/gh-stack branch from dirty worktree changes.",
	};
}
