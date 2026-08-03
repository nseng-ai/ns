import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Create a Graphite branch using \`gt create\` from dirty worktree changes.\n\nThis command requires pending worktree changes. It stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit.\n\nIf the worktree is clean, use \`ns flow branch-latest-commit\` to move the latest eligible commit to a new Graphite child branch.\n\n`,
		summary: "Create a Graphite branch from dirty worktree changes.",
	};
}
