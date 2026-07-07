import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { reviewsExecPublishFindingsCommand } from "../commands/exec-publish-findings.ts";
import { reviewsExecRecordFindingsCommand } from "../commands/exec-record-findings.ts";
import { reviewListCommand } from "../commands/list.ts";
import { reviewLogCommand } from "../commands/review-log.ts";
import { reviewLsCommand } from "../commands/ls.ts";
import { reviewRunCommand } from "../commands/review-run.ts";

export const reviewsRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "reviews",
	description: "Run configured code reviews and publish findings.",
	commands: [
		repoLocalNsCommandDescriptor({
			command: reviewListCommand,
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewLsCommand,
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewLogCommand,
			manifestName: "review-log",
			manifestPath: ["review", "log"],
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewRunCommand,
			manifestName: "review-run",
			manifestPath: ["review", "run"],
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewsExecRecordFindingsCommand,
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewsExecPublishFindingsCommand,
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
	],
});
