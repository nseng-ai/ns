import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	entries: [
		hiddenExecGroup("Agent-only GitHub pull request feedback operations.", [
			{
				kind: "raw-command",
				name: "download-feedback",
				load: async () => ({
					default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
						(await import("./download-feedback.ts")).downloadFeedbackOperation,
					),
				}),
			},
			{
				kind: "raw-command",
				name: "map-branch-prs",
				load: async () => ({
					default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
						(await import("./map-branch-prs.ts")).mapBranchPrsOperation,
					),
				}),
			},
			{
				kind: "raw-command",
				name: "branch-pr-checks",
				load: async () => ({
					default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
						(await import("./branch-pr-checks.ts")).branchPrChecksOperation,
					),
				}),
			},
			{
				kind: "raw-command",
				name: "wait-for-checks",
				load: async () => ({
					default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
						(await import("./wait-for-checks.ts")).waitForChecksOperation,
					),
				}),
			},
			{
				kind: "raw-command",
				name: "pr-details",
				load: () => loadPrimitiveOperationCommand("pr-details"),
			},
			{
				kind: "raw-command",
				name: "branch-pr",
				load: () => loadPrimitiveOperationCommand("branch-pr"),
			},
			{
				kind: "raw-command",
				name: "open-prs",
				load: () => loadPrimitiveOperationCommand("open-prs"),
			},
			{
				kind: "raw-command",
				name: "pr-reviews",
				load: () => loadPrimitiveOperationCommand("pr-reviews"),
			},
			{
				kind: "raw-command",
				name: "pr-review-threads",
				load: () => loadPrimitiveOperationCommand("pr-review-threads"),
			},
			{
				kind: "raw-command",
				name: "pr-discussion-comments",
				load: () => loadPrimitiveOperationCommand("pr-discussion-comments"),
			},
			{
				kind: "raw-command",
				name: "pr-checks",
				load: () => loadPrimitiveOperationCommand("pr-checks"),
			},
			{
				kind: "raw-command",
				name: "reply-review-thread",
				load: () => loadPrimitiveOperationCommand("reply-review-thread"),
			},
			{
				kind: "raw-command",
				name: "resolve-review-thread",
				load: () => loadPrimitiveOperationCommand("resolve-review-thread"),
			},
			{
				kind: "raw-command",
				name: "close-review-threads",
				load: () => loadPrimitiveOperationCommand("close-review-threads"),
			},
		]),
	],
});

async function loadPrimitiveOperationCommand(operationName: string) {
	return {
		default: (await import("./ns-command.ts")).prAddressOperationNsCommand(
			(await import("./primitive-commands.ts")).findPrimitiveOperation(operationName),
		),
	};
}
