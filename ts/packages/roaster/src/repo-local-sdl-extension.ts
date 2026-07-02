import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@sdl/kernel/sdk";

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
			manifestName: "review-list",
			manifestPath: ["review", "list"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewLsCommand,
			manifestName: "review-ls",
			manifestPath: ["review", "ls"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewLogCommand,
			manifestName: "review-log",
			manifestPath: ["review", "log"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
		repoLocalSdlCommandDescriptor({
			command: roasterReviewRunCommand,
			manifestName: "review-run",
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
			manifestName: "roast-list",
			manifestPath: ["roast", "list"],
			packageExportPrefix: "@sdl/roaster/commands",
		}),
	],
});
