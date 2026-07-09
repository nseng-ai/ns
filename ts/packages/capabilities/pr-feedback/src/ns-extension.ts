import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	entries: [
		{
			group: "exec",
			hidden: true,
			description: "Agent-only GitHub pull request feedback operations.",
			entries: [
				{
					name: "download-feedback",
					load: async () => ({
						default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
							(await import("./download-feedback.ts")).downloadFeedbackOperation,
						),
					}),
				},
				{
					name: "map-branch-prs",
					load: async () => ({
						default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
							(await import("./map-branch-prs.ts")).mapBranchPrsOperation,
						),
					}),
				},
				{
					name: "branch-pr-checks",
					load: async () => ({
						default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
							(await import("./branch-pr-checks.ts")).branchPrChecksOperation,
						),
					}),
				},
				{ name: "pr-details", load: () => loadPrimitiveOperationCommand("pr-details") },
				{ name: "branch-pr", load: () => loadPrimitiveOperationCommand("branch-pr") },
				{ name: "open-prs", load: () => loadPrimitiveOperationCommand("open-prs") },
				{ name: "pr-reviews", load: () => loadPrimitiveOperationCommand("pr-reviews") },
				{
					name: "pr-review-threads",
					load: () => loadPrimitiveOperationCommand("pr-review-threads"),
				},
				{
					name: "pr-discussion-comments",
					load: () => loadPrimitiveOperationCommand("pr-discussion-comments"),
				},
				{ name: "pr-checks", load: () => loadPrimitiveOperationCommand("pr-checks") },
				{
					name: "reply-review-thread",
					load: () => loadPrimitiveOperationCommand("reply-review-thread"),
				},
				{
					name: "resolve-review-thread",
					load: () => loadPrimitiveOperationCommand("resolve-review-thread"),
				},
				{
					name: "close-review-threads",
					load: () => loadPrimitiveOperationCommand("close-review-threads"),
				},
			],
		},
	],
});

async function loadPrimitiveOperationCommand(operationName: string) {
	return {
		default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
			(await import("./primitive-commands.ts")).findPrimitiveOperation(operationName),
		),
	};
}
