import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

const SUBMIT_COMMAND_DESCRIPTION = `Run configured pre-submit checks, checkpoint outstanding changes, then submit the repository workflow target.

Without [workflow].stack-provider, Flow pushes the current branch at its exact HEAD without force and creates or verifies one GitHub PR. With stack-provider = "graphite", Flow preserves the configured Graphite stack workflow using gt submit --no-edit --publish --no-stack --no-ai --no-interactive.

Pre-submit checks are consumer config in the repo-root ns.toml ([points]."flow.submit.pre", an array of command strings such as ["just"]). Each entry is whitespace-split and executed directly without a shell; the first failing check aborts the submit. Skip them with --no-checks.

Environment:
  NS_FLOW_PR_INVENTORY_PROMPT  Optional path to a custom PR inventory prompt.

  NS_SUBMIT_FAILURE_LOG_DIR     Optional directory for raw submit-failure transcripts.

By default, newly created PRs receive complete generated inventory titles and bodies; PRs that existed before the invocation preserve their existing prose. On a branch target, Flow prepares generated metadata before creating the PR. On a Graphite stack target, Flow generates metadata after Graphite creates the PRs. Use --title-prefix to prepend one deterministic prefix to every newly created PR title in this invocation. The prefix is preserved and only the generated title candidate is truncated to fit the 120-character title limit. Even with --generate-pr-inventory, pre-existing PR titles are regenerated without the prefix. Use --generate-pr-inventory to explicitly replace metadata for every PR resolved in the selected submit scope, existing and new: each selected PR gets a complete generated inventory title and body, and all existing body content is removed, including human-authored prose. Because this is destructive, --generate-pr-inventory asks for confirmation before any workflow work; pass --yes/-y to approve non-interactively. Flow prepares every replacement before the first GitHub edit, then applies them sequentially; there is no rollback. Use ns flow generate-pr-inventory from an existing PR's branch for a focused single-PR replacement.

The command owns its output and exit code. It does not support --format.`;

export function metadata(): ClinkrCommandMetadata {
	return {
		description: SUBMIT_COMMAND_DESCRIPTION,
		summary: "Checkpoint pending changes, then submit the configured branch or stack target.",
	};
}
