import type { SdlCommandIo } from "@ns/kernel/sdk";
import { formatErrorMessage } from "@ns/core/primitives";
import {
	LandStackCommandStream,
	createLandUiCommandIo,
	renderCommandStreamMessage,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import { COMMAND_NAME, COMMAND_STREAM_MESSAGE_TYPE } from "./stack/constants.ts";
import type { LandGraphiteCommandChannel } from "./stack/graphite-command-channel.ts";
import { createLandRuntime, type LandRuntime } from "./stack/land-runtime.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./stack/errors.ts";
import { buildLandingPlan } from "./stack/landing-plan.ts";
import { presentLandStackFailure, type LandingSession } from "./stack/landing-coordination.ts";
import type { PreMergeConfirmation } from "./stack/pre-merge-confirmation.ts";
import { present, setStatus, usage } from "./stack/presentation.ts";
import { executeLandingPlan } from "./stack/landing-plan-execution.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedPr,
	LandingWarning,
	ParsedArgs,
} from "./stack/types.ts";

export type { LandStackExtensionAPI } from "./stack/types.ts";

export interface ExecuteStackLandingOptions {
	io?: SdlCommandIo;
	shouldSkipMainConfirmation?: boolean;
	preMergeConfirmation?: PreMergeConfirmation;
	liveProgress?: LandLiveProgressSink;
	graphite?: LandGraphiteCommandChannel;
}

export function registerLandStackRenderer(
	pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">,
): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string }> | null {
	const options = ["--yes", "--dry-run", "--preserve", "--force", "--verbose", "--help"];
	const token = prefix.trim().split(/\s+/).pop() ?? "";
	const filtered = options.filter((option) => option.startsWith(token));
	return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
}

export async function executeStackLanding(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	parsedArgs: ParsedArgs,
	options: ExecuteStackLandingOptions = {},
): Promise<LandStackOutcome> {
	const landed: LandedPr[] = [];
	const warnings: LandingWarning[] = [];
	const io = options.io ?? createLandUiCommandIo(pi, ctx);
	const commandStream = new LandStackCommandStream(io, {
		shouldShowRunningCommandStatus: ctx.hasUI,
		...(options.liveProgress === undefined ? {} : { liveProgress: options.liveProgress }),
	});
	const session: LandingSession = { ctx, commandStream, landed };
	const createdRuntime = createLandRuntime(pi, commandStream);
	const runtime: LandRuntime =
		options.graphite === undefined
			? createdRuntime
			: { ...createdRuntime, graphite: options.graphite };
	try {
		if (parsedArgs.shouldShowHelp) {
			present({ ctx, message: usage(), level: "info" });
			return completed();
		}

		setStatus(ctx, "preflighting...");
		const plan = await buildLandingPlan(runtime, ctx.cwd, {
			shouldAllowSubmitRequiredState: true,
		});
		if (plan.type === "failure") {
			presentLandStackFailure({ session, failure: plan.failure });
			return failure(plan.failure);
		}
		return await executeLandingPlan({
			runtime,
			parsedArgs,
			options,
			session,
			plan: plan.value,
			warnings,
		});
	} catch (error) {
		const landFailure = landStackFailure(`land failed unexpectedly: ${formatErrorMessage(error)}`);
		presentLandStackFailure({
			session,
			failure: landFailure,
		});
		return failure(landFailure);
	} finally {
		setStatus(ctx, undefined);
	}
}

export function parseArgs(argsText: string): LandStackResult<ParsedArgs> {
	const parsed: ParsedArgs = {
		shouldSkipConfirmation: false,
		isDryRun: false,
		shouldPreserveSlot: false,
		shouldForceCleanup: false,
		shouldShowHelp: false,
		shouldStreamVerboseOutput: false,
	};
	const parts = argsText.trim().split(/\s+/).filter(Boolean);

	for (const part of parts) {
		if (part === "--yes" || part === "-y") {
			parsed.shouldSkipConfirmation = true;
		} else if (part === "--dry-run") {
			parsed.isDryRun = true;
		} else if (part === "--preserve" || part === "-p") {
			parsed.shouldPreserveSlot = true;
		} else if (part === "--force" || part === "-f") {
			parsed.shouldForceCleanup = true;
		} else if (part === "--help" || part === "-h") {
			parsed.shouldShowHelp = true;
		} else if (part === "--verbose") {
			parsed.shouldStreamVerboseOutput = true;
		} else {
			return failure(landStackFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`));
		}
	}

	return success(parsed);
}
