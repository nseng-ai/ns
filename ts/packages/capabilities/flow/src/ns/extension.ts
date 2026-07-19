import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export const flowExtensionDescriptor = defineExtension({
	group: "flow",
	description: "Checkpoint, branch, submit, and land Graphite-backed work.",
	points: [
		{
			id: "flow.submit.pre",
			accepts: "hook",
			cardinality: "many",
			description: "Commands to run before flow submit checkpointing.",
		},
		{
			id: "flow.submit.pre.recovery",
			accepts: "prompt",
			cardinality: "one",
			default: "../submit/prompts/submit-check-recovery-default.md",
			description: "Agent guidance after a flow submit pre-check failure.",
		},
		{
			id: "flow.submit.pr-description",
			accepts: "prompt",
			cardinality: "one",
			default: "../submit/prompts/pr-description-default.md",
			description: "Prompt for generating pull request descriptions during flow submit.",
		},
	],
	entries: [
		{
			name: "changes",
			load: async () => ({ default: (await import("./commands/changes.ts")).flowChangesCommand }),
		},
		{
			name: "cp",
			load: async () => ({ default: (await import("./commands/cp/command.ts")).flowCpCommand }),
		},
		{
			name: "autobranch",
			load: async () => ({
				default: (await import("./commands/autobranch.ts")).flowAutobranchCommand,
			}),
		},
		{
			name: "branch-latest-commit",
			load: async () => ({
				default: (await import("./commands/branch-latest-commit.ts")).flowBranchLatestCommitCommand,
			}),
		},
		{
			name: "autoslot",
			load: async () => ({ default: (await import("./commands/autoslot.ts")).flowAutoslotCommand }),
		},
		{
			name: "submit",
			load: async () => ({ default: (await import("./commands/submit.ts")).flowSubmitCommand }),
		},
		{
			name: "regenerate-pr",
			load: async () => ({
				default: (await import("./commands/regenerate-pr.ts")).flowRegeneratePrCommand,
			}),
		},
		{
			name: "push",
			load: async () => ({ default: (await import("./commands/push.ts")).flowPushCommand }),
		},
		{
			name: "land",
			load: async () => ({ default: (await import("./commands/land.ts")).flowLandCommand }),
		},
		{
			name: "pull-trunk",
			load: async () => ({
				default: (await import("./commands/pull-trunk.ts")).flowPullTrunkCommand,
			}),
		},
		{
			name: "squash-stack",
			load: async () => ({
				default: (await import("./commands/squash-stack.ts")).flowSquashStackCommand,
			}),
		},
		hiddenExecGroup("Agent-only flow operations.", [
			{
				name: "read-graphite-branch-metadata",
				load: async () => ({
					default: (await import("./commands/exec-read-graphite-branch-metadata.ts"))
						.flowExecReadGraphiteBranchMetadataCommand,
				}),
			},
		]),
	],
});

export const flowExtensionDescriptorSource = {
	descriptor: flowExtensionDescriptor,
	descriptorUrl: import.meta.url,
};

export default flowExtensionDescriptor;
