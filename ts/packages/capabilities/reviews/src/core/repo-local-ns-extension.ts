import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { reviewsExecPublishFindingsCommand } from "../commands/exec-publish-findings.ts";
import { reviewsExecRecordFindingsCommand } from "../commands/exec-record-findings.ts";
import { reviewsReviewListCommand } from "../commands/review-list.ts";
import { reviewsReviewLogCommand } from "../commands/review-log.ts";
import { reviewsReviewLsCommand } from "../commands/review-ls.ts";
import { reviewsReviewRunCommand } from "../commands/review-run.ts";

export const reviewsRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "reviews",
	description: "Run configured code reviews and publish findings.",
	commands: [
		repoLocalNsCommandDescriptor({
			command: reviewsReviewListCommand,
			manifestName: "review-list",
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewsReviewLsCommand,
			manifestName: "review-ls",
			manifestPath: ["review", "ls"],
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewsReviewLogCommand,
			manifestName: "review-log",
			manifestPath: ["review", "log"],
			packageExportPrefix: "@nseng-ai/reviews/commands",
		}),
		repoLocalNsCommandDescriptor({
			command: reviewsReviewRunCommand,
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
