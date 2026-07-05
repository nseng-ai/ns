import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { roasterExecPublishFindingsCommand } from "../commands/exec-publish-findings.ts";
import { roasterExecRecordFindingsCommand } from "../commands/exec-record-findings.ts";
import { roasterReviewListCommand } from "../commands/review-list.ts";
import { roasterReviewLogCommand } from "../commands/review-log.ts";
import { roasterReviewLsCommand } from "../commands/review-ls.ts";
import { roasterReviewRunCommand } from "../commands/review-run.ts";
import { roasterRoastListCommand } from "../commands/roast-list.ts";

export const roasterRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "roaster",
	description: "Run configured code review roasters and publish findings.",
	commands: [
		repoLocalNsCommandDescriptor({
			command: roasterReviewListCommand,
			manifestName: "review-list",
			manifestPath: ["review", "list"],
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterReviewLsCommand,
			manifestName: "review-ls",
			manifestPath: ["review", "ls"],
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterReviewLogCommand,
			manifestName: "review-log",
			manifestPath: ["review", "log"],
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterReviewRunCommand,
			manifestName: "review-run",
			manifestPath: ["review", "run"],
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterExecRecordFindingsCommand,
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterExecPublishFindingsCommand,
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: roasterRoastListCommand,
			manifestName: "roast-list",
			manifestPath: ["roast", "list"],
			packageExportPrefix: "@nseng-ai/roaster/commands",
		}),
	],
});
