import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	entries: [
		{
			name: "exec-download-feedback",
			load: async () => ({
				default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
					(await import("./download-feedback.ts")).downloadFeedbackOperation,
				),
			}),
		},
		{
			name: "exec-map-branch-prs",
			load: async () => ({
				default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
					(await import("./map-branch-prs.ts")).mapBranchPrsOperation,
				),
			}),
		},
		{
			name: "exec-branch-pr-checks",
			load: async () => ({
				default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
					(await import("./branch-pr-checks.ts")).branchPrChecksOperation,
				),
			}),
		},
		{ name: "exec-pr-details", load: () => loadPrimitiveOperationCommand("pr-details") },
		{ name: "exec-branch-pr", load: () => loadPrimitiveOperationCommand("branch-pr") },
		{ name: "exec-open-prs", load: () => loadPrimitiveOperationCommand("open-prs") },
		{ name: "exec-pr-reviews", load: () => loadPrimitiveOperationCommand("pr-reviews") },
		{
			name: "exec-pr-review-threads",
			load: () => loadPrimitiveOperationCommand("pr-review-threads"),
		},
		{
			name: "exec-pr-discussion-comments",
			load: () => loadPrimitiveOperationCommand("pr-discussion-comments"),
		},
		{ name: "exec-pr-checks", load: () => loadPrimitiveOperationCommand("pr-checks") },
		{
			name: "exec-reply-review-thread",
			load: () => loadPrimitiveOperationCommand("reply-review-thread"),
		},
		{
			name: "exec-resolve-review-thread",
			load: () => loadPrimitiveOperationCommand("resolve-review-thread"),
		},
		{
			name: "exec-close-review-threads",
			load: () => loadPrimitiveOperationCommand("close-review-threads"),
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
