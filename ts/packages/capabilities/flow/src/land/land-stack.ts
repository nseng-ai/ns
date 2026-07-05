import type { GitWorktreeStateFs } from "@nseng-ai/capability-kit/git";
import type { NsCommandIo } from "@nseng-ai/ns/kernel/sdk";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	LandStackCommandStream,
	createLandUiCommandIo,
	landCommandStreamObservabilityOptions,
	renderCommandStreamMessage,
	type FlowLandObservabilityChannels,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import type { FlowLandExternalCallTelemetrySink } from "./stack/external-call-telemetry.ts";
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
import { landCompletionFlags, parseLandFlagToken } from "./stack/flags.ts";
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
	io?: NsCommandIo;
	shouldSkipMainConfirmation?: boolean;
	preMergeConfirmation?: PreMergeConfirmation;
	liveProgress?: LandLiveProgressSink;
	graphite?: LandGraphiteCommandChannel;
	externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
	observabilityChannels?: FlowLandObservabilityChannels;
	gitStateFs?: GitWorktreeStateFs;
}

export function registerLandStackRenderer(
	pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">,
): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string }> | null {
	const token = prefix.trim().split(/\s+/).pop() ?? "";
	const filtered = landCompletionFlags().filter((option) => option.startsWith(token));
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
	const observabilityChannels = executeStackLandingObservabilityChannels(options);
	const io = observabilityChannels.progressIo ?? createLandUiCommandIo(pi, ctx);
	const commandStream = new LandStackCommandStream(io, {
		shouldShowRunningCommandStatus: ctx.hasUI,
		...landCommandStreamObservabilityOptions(observabilityChannels),
	});
	const session: LandingSession = { ctx, commandStream, landed };
	const createdRuntime = createLandRuntime(
		pi,
		commandStream,
		optionalEntry("gitStateFs", options.gitStateFs),
	);
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

function executeStackLandingObservabilityChannels(
	options: ExecuteStackLandingOptions,
): FlowLandObservabilityChannels {
	return (
		options.observabilityChannels ?? {
			...optionalEntry("progressIo", options.io),
			...optionalEntry("liveProgress", options.liveProgress),
			...optionalEntry("externalCallTelemetry", options.externalCallTelemetry),
		}
	);
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
		const parsedFlag = parseLandFlagToken(part);
		if (parsedFlag === undefined) {
			return failure(landStackFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`));
		}
		parsed[parsedFlag] = true;
	}

	return success(parsed);
}
