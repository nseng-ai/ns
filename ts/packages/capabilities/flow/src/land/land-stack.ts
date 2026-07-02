import type { SdlCommandIo } from "@sdl/kernel/sdk";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	LandStackCommandStream,
	createLandUiCommandIo,
	renderCommandStreamMessage,
	withCommandStreaming,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import { COMMAND_NAME, COMMAND_STREAM_MESSAGE_TYPE } from "./stack/constants.ts";
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
import { loadLandingShape } from "./stack/stack-facts.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedPr,
	LandingShape,
	LandingWarning,
	ParsedArgs,
} from "./stack/types.ts";

export type { LandStackExtensionAPI } from "./stack/types.ts";

export interface ExecuteStackLandingOptions {
	io?: SdlCommandIo;
	shouldSkipMainConfirmation?: boolean;
	preMergeConfirmation?: PreMergeConfirmation;
	initialShape?: LandingShape;
	liveProgress?: LandLiveProgressSink;
}

export function registerLandStackRenderer(
	pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">,
): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string }> | null {
	const options = ["--yes", "--dry-run", "--free", "--force", "--verbose", "--help"];
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
	const runtimePi = withCommandStreaming(pi, commandStream);
	try {
		if (parsedArgs.shouldShowHelp) {
			present({ ctx, message: usage(), level: "info" });
			return completed();
		}

		setStatus(ctx, "preflighting...");
		const shape = options.initialShape
			? success(options.initialShape)
			: await loadLandingShape(runtimePi, ctx.cwd);
		if (shape.type === "failure") {
			presentLandStackFailure({ session, failure: shape.failure });
			return failure(shape.failure);
		}

		const plan = await buildLandingPlan(runtimePi, ctx.cwd, {
			shouldAllowSubmitRequiredState: true,
			preloadedShape: shape.value,
		});
		if (plan.type === "failure") {
			presentLandStackFailure({ session, failure: plan.failure });
			return failure(plan.failure);
		}
		return await executeLandingPlan({
			pi,
			runtimePi,
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
		shouldFreeSlot: false,
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
		} else if (part === "--free") {
			parsed.shouldFreeSlot = true;
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
