import { defineRepoLocalSdlExtensionDescriptor, repoLocalSdlCommandDescriptor } from "sdl-sdk";

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
		repoLocalSdlCommandDescriptor({
			command: roasterReviewListCommand,
			manifestPath: ["review", "list"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewLsCommand,
			manifestPath: ["review", "ls"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewLogCommand,
			manifestPath: ["review", "log"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewRunCommand,
			manifestPath: ["review", "run"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterExecRecordFindingsCommand,
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterExecPublishFindingsCommand,
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterRoastListCommand,
			manifestPath: ["roast", "list"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
	],
});
