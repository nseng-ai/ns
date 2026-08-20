import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Move the latest eligible single-parent commit to a new Graphite child branch.\n\nThis command requires a clean worktree. The latest commit is eligible when the source has no upstream, is locally ahead of its locally known upstream, or is exactly synchronized on a non-trunk branch. Remote-ahead, diverged, and exactly synchronized Git trunk states are refused. Trunk identity comes from cached origin/HEAD, and upstream checks use only local tracking refs; neither check fetches.\n\nIt creates a local-only Graphite branch with \`gt create\`, resets the source branch to the commit parent, hard-resets the new child branch to the original commit SHA, verifies HEAD, and cleans up recovery evidence. The mutation does not fetch, push, publish, submit, or update PRs. After a synchronized success, the upstream remains unchanged; explicitly run \`ns flow gt submit\` from the new child to publish the reshaped stack.\n\nUse \`ns flow gt autobranch\` instead when pending dirty worktree changes should be moved to a new branch.\n`,
		summary: "Move the latest eligible commit to a new Graphite branch.",
	};
}
