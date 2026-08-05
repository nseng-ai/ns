import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Push already-committed work on the current branch with plain git push.\n\nThe command first runs git status --porcelain and requires a clean worktree before pushing. It then runs plain git push with a two-minute timeout. It has no intentional arguments or options.\n\nThis command does not update Graphite metadata. Do not use it for Graphite-tracked PR branches, because moving the remote PR branch outside Graphite can make later gt submit / ns flow submit runs fail until local Graphite state is synced with gt get or gt sync. Use \`ns flow submit\` / \`/ns:flow:submit\` when the current Graphite stack needs submission, PR metadata updates, or the full submit flow.`,
		summary: "Push committed non-Graphite branch work with git push.",
	};
}
