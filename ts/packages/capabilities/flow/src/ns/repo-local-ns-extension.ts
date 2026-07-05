import { defineRepoLocalNsExtensionDescriptor, repoLocalNsCommandDescriptor } from "@ns/kernel/sdk";

import { flowAutobranchCommand } from "./commands/autobranch.ts";
import { flowAutoslotCommand } from "./commands/autoslot.ts";
import { flowBranchLatestCommitCommand } from "./commands/branch-latest-commit.ts";
import { flowChangesCommand } from "./commands/changes.ts";
import { flowCpCommand } from "./commands/cp.ts";
import { flowExecReadGraphiteBranchMetadataCommand } from "./commands/exec-read-graphite-branch-metadata.ts";
import { flowLandCommand } from "./commands/land.ts";
import { flowPullTrunkCommand } from "./commands/pull-trunk.ts";
import { flowPushCommand } from "./commands/push.ts";
import { flowRegeneratePrCommand } from "./commands/regenerate-pr.ts";
import { flowSubmitCommand } from "./commands/submit.ts";

export const flowRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "flow",
	description: "Checkpoint, branch, submit, and land Graphite-backed work.",
	commands: [
		flowChangesCommand,
		flowCpCommand,
		flowAutobranchCommand,
		flowBranchLatestCommitCommand,
		flowAutoslotCommand,
		flowSubmitCommand,
		flowRegeneratePrCommand,
		flowPushCommand,
		flowLandCommand,
		flowPullTrunkCommand,
		flowExecReadGraphiteBranchMetadataCommand,
	].map((command) =>
		repoLocalNsCommandDescriptor({
			command,
			packageExportPrefix: "@ns/flow/commands",
		}),
	),
});
