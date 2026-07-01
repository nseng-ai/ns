import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

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

export const flowRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "flow",
	description: "Checkpoint, branch, submit, and land Graphite-backed work.",
	commands: [
		{
			command: flowChangesCommand,
			manifestEntry: "./src/commands/changes.ts",
			packageExport: "sdl-flow/commands/changes",
		},
		{
			command: flowCpCommand,
			manifestEntry: "./src/commands/cp.ts",
			packageExport: "sdl-flow/commands/cp",
		},
		{
			command: flowAutobranchCommand,
			manifestEntry: "./src/commands/autobranch.ts",
			packageExport: "sdl-flow/commands/autobranch",
		},
		{
			command: flowBranchLatestCommitCommand,
			manifestEntry: "./src/commands/branch-latest-commit.ts",
			packageExport: "sdl-flow/commands/branch-latest-commit",
		},
		{
			command: flowAutoslotCommand,
			manifestEntry: "./src/commands/autoslot.ts",
			packageExport: "sdl-flow/commands/autoslot",
		},
		{
			command: flowSubmitCommand,
			manifestEntry: "./src/commands/submit.ts",
			packageExport: "sdl-flow/commands/submit",
		},
		{
			command: flowRegeneratePrCommand,
			manifestEntry: "./src/commands/regenerate-pr.ts",
			packageExport: "sdl-flow/commands/regenerate-pr",
		},
		{
			command: flowPushCommand,
			manifestEntry: "./src/commands/push.ts",
			packageExport: "sdl-flow/commands/push",
		},
		{
			command: flowLandCommand,
			manifestEntry: "./src/commands/land.ts",
			packageExport: "sdl-flow/commands/land",
		},
		{
			command: flowPullTrunkCommand,
			manifestEntry: "./src/commands/pull-trunk.ts",
			packageExport: "sdl-flow/commands/pull-trunk",
		},
		{
			command: flowExecReadGraphiteBranchMetadataCommand,
			manifestEntry: "./src/commands/exec-read-graphite-branch-metadata.ts",
			packageExport: "sdl-flow/commands/exec-read-graphite-branch-metadata",
		},
	],
});
