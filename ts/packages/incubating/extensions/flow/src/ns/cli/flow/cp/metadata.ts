import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Create a checkpoint commit for the current diff.\n\nThe command captures the pending worktree, refuses Git\x27s trunk branch from cached origin/HEAD, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message. Checkpoint safety requires a successful cached origin/HEAD lookup.\n\nUse --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.\n`,
		summary: "Create a checkpoint commit for the current diff.",
	};
}
