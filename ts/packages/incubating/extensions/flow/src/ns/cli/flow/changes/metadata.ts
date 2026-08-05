import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Summarize outstanding worktree changes without committing.\n\nThe command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.\n\nThe command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`,
		summary: "Summarize outstanding worktree changes without committing.",
	};
}
