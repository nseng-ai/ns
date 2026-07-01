import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { roasterExecPublishFindingsCommand } from "./commands/exec-publish-findings.ts";
import { roasterExecRecordFindingsCommand } from "./commands/exec-record-findings.ts";
import { roasterReviewListCommand } from "./commands/review-list.ts";
import { roasterReviewLogCommand } from "./commands/review-log.ts";
import { roasterReviewLsCommand } from "./commands/review-ls.ts";
import { roasterReviewRunCommand } from "./commands/review-run.ts";
import { roasterRoastListCommand } from "./commands/roast-list.ts";

export const roasterRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "roaster",
	description: "Run configured code review roasters and publish findings.",
	commands: [
		{
			command: roasterReviewListCommand,
			manifestName: "review-list",
			manifestPath: ["review", "list"],
			manifestEntry: "./src/commands/review-list.ts",
			packageExport: "@sdl/roaster/commands/review-list",
		},
		{
			command: roasterReviewLsCommand,
			manifestName: "review-ls",
			manifestPath: ["review", "ls"],
			manifestEntry: "./src/commands/review-ls.ts",
			packageExport: "@sdl/roaster/commands/review-ls",
		},
		{
			command: roasterReviewLogCommand,
			manifestName: "review-log",
			manifestPath: ["review", "log"],
			manifestEntry: "./src/commands/review-log.ts",
			packageExport: "@sdl/roaster/commands/review-log",
		},
		{
			command: roasterReviewRunCommand,
			manifestName: "review-run",
			manifestPath: ["review", "run"],
			manifestEntry: "./src/commands/review-run.ts",
			packageExport: "@sdl/roaster/commands/review-run",
		},
		{
			command: roasterExecRecordFindingsCommand,
			manifestEntry: "./src/commands/exec-record-findings.ts",
			packageExport: "@sdl/roaster/commands/exec-record-findings",
		},
		{
			command: roasterExecPublishFindingsCommand,
			manifestEntry: "./src/commands/exec-publish-findings.ts",
			packageExport: "@sdl/roaster/commands/exec-publish-findings",
		},
		{
			command: roasterRoastListCommand,
			manifestName: "roast-list",
			manifestPath: ["roast", "list"],
			manifestEntry: "./src/commands/roast-list.ts",
			packageExport: "@sdl/roaster/commands/roast-list",
		},
	],
});
