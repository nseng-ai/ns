import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: `Generate and completely replace the current branch PR title and body.\n\nThe command asks for confirmation before model work, reads the current branch PR with gh, generates fresh PR inventory from the PR diff and commit headlines, then replaces the complete PR title and body. All existing body content is removed, including human prose and other ns-managed regions. Use --yes/-y to approve generation and destructive replacement non-interactively.\n\nEnvironment:\n  NS_FLOW_PR_INVENTORY_PROMPT  Optional path to a custom PR inventory prompt. Overrides .ns/prompts/flow.submit.pr-inventory.md and the built-in prompt.`,
		summary: "Generate and replace the complete PR title and body.",
	};
}
