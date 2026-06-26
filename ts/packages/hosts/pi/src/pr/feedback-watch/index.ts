import { registerCommandWithImmediateAck } from "../../commands/ack.ts";

import { parseWatchCommandArgs } from "./command-args.ts";
export { parseWatchCommandArgs } from "./command-args.ts";
export type {
	ExistingFeedbackMode,
	WatchCommandAction,
	WatchCommandOptions,
	WatchCommandParseResult,
} from "./command-args.ts";
export {
	PR_FEEDBACK_WATCH_COMMAND_NAME,
	PR_FEEDBACK_WATCH_MESSAGE_TYPE,
	PR_FEEDBACK_WATCH_STATE_TYPE,
	prFeedbackWatchParity,
} from "./constants.ts";
import { MIN_INTERVAL_MS, PR_FEEDBACK_WATCH_COMMAND_NAME } from "./constants.ts";
import { PrFeedbackWatchController } from "./controller.ts";
export {
	buildFeedbackFingerprint,
	feedbackItemKeyFromDownload,
	feedbackItemKeysFromFingerprint,
	filterIgnoredFeedback,
	fingerprintKeyFromItems,
	maxFingerprintTimestamp,
	parseDiscussionCommentFingerprint,
	parseReviewCommentFingerprint,
	parseReviewFingerprint,
} from "./fingerprint.ts";
export { parseGitHubPullRequestUrl } from "./github.ts";
export type {
	DispatchPromptInput,
	FeedbackFingerprint,
	FeedbackFingerprintItem,
	FeedbackItemKey,
	FilteredFeedbackItems,
	IgnoredFeedbackItem,
	PrFeedbackWatchGithubPrIdentity,
	WatchStatus,
} from "./model.ts";
export { buildDetectedFeedbackPrompt } from "./prompt.ts";
import { notify } from "./runtime.ts";
import { formatWatchStatus } from "./status.ts";
export type { ExtensionAPI, ExtensionContext, PrFeedbackWatchExtensionOptions } from "./types.ts";
import type { ExtensionAPI, PrFeedbackWatchExtensionOptions } from "./types.ts";

export default function prFeedbackWatchExtension(
	pi: ExtensionAPI,
	options: PrFeedbackWatchExtensionOptions = {},
): void {
	const controller = new PrFeedbackWatchController(pi, options);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: PR_FEEDBACK_WATCH_COMMAND_NAME,
		commandDefinition: {
			description:
				"Watch the current branch PR for feedback; bare command starts with existing feedback or toggles off when active.",
			handler: async (rawArgs, ctx) => {
				const parsed = parseWatchCommandArgs(rawArgs, options.minimumIntervalMs ?? MIN_INTERVAL_MS);
				if (parsed.type === "invalid") {
					notify(ctx, parsed.message, "error");
					return;
				}

				switch (parsed.action) {
					case "toggle":
						if (controller.status().isEnabled) {
							controller.stop("user");
							notify(ctx, "PR feedback watch stopped.", "info");
							return;
						}
						await ctx.waitForIdle?.();
						await controller.start(ctx, parsed.options);
						return;
					case "start":
						await ctx.waitForIdle?.();
						await controller.start(ctx, parsed.options);
						return;
					case "once":
						await ctx.waitForIdle?.();
						await controller.once(ctx, parsed.options);
						return;
					case "stop":
						controller.stop("user");
						notify(ctx, "PR feedback watch stopped.", "info");
						return;
					case "status":
						notify(ctx, formatWatchStatus(controller.status()), "info");
						return;
					default: {
						const exhaustive: never = parsed.action;
						return exhaustive;
					}
				}
			},
		},
	});

	pi.on("session_start", (_event, ctx) => {
		controller.activate(ctx);
	});
	pi.on("agent_end", () => controller.handleAgentEnd());
	pi.on("session_shutdown", () => {
		controller.stop("shutdown");
	});
}
