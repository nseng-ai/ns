import type { GitWorktreeStateFs } from "@nseng-ai/foundation/git";
import type { NsCommandIo } from "@nseng-ai/sdk";
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
import {
	createStackLandingRuntime,
	type StackLandingRuntime,
} from "./stack/stack-landing-runtime.ts";
import {
	landCompleted,
	landFailure,
	landOutcomeFailure,
	landingExecutionFailure,
	landSuccess,
	type LandOutcome,
	type LandResult,
} from "./results.ts";
import { landCompletionFlags, parseLandFlagToken } from "./stack/flags.ts";
import { present, setStatus, usage } from "./land-presentation.ts";
import { approvedLandConfirmationKinds } from "./landing-confirmation-policy.ts";
import {
	createFlowLandExecutionProgress,
	runFlowStackLanding,
	presentLandStackFailure,
	type FlowLandingExecutionInput,
	type LandingSession,
} from "./landing-execution.ts";
import type {
	LandProgressReporter,
	LandStackCommandContext,
	LandStackExtensionAPI,
	ParsedArgs,
} from "./stack/types.ts";

export type { LandStackExtensionAPI } from "./stack/types.ts";

export interface ExecuteStackLandingOptions {
	io?: NsCommandIo;
	readonly hasSlotsExtension: boolean;
	execution?: FlowLandingExecutionInput;
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
	options: ExecuteStackLandingOptions,
): Promise<LandOutcome> {
	const observabilityChannels = executeStackLandingObservabilityChannels(options);
	const io = observabilityChannels.progressIo ?? createLandUiCommandIo(pi, ctx);
	const commandStream = new LandStackCommandStream(io, {
		shouldShowRunningCommandStatus: ctx.hasUI,
		...landCommandStreamObservabilityOptions(observabilityChannels),
	});
	const progressReporter: LandProgressReporter = {
		note: (message) => commandStream.note(message),
		setStatus: (message) => setStatus(ctx, message),
	};
	const progress = createFlowLandExecutionProgress({
		commandStream,
		progress: progressReporter,
		...optionalEntry("matrix", commandStream.matrix),
	});
	const session: LandingSession = { ctx, commandStream, progress };
	const runtime: StackLandingRuntime = createStackLandingRuntime(pi, commandStream, {
		...optionalEntry("gitStateFs", options.gitStateFs),
		...optionalEntry("graphite", options.graphite),
	});
	try {
		if (parsedArgs.shouldShowHelp) {
			present({ ctx, message: usage(), level: "info" });
			return landCompleted();
		}

		progress.setStatus("preflighting...");
		return await runFlowStackLanding({
			runtime,
			parsedArgs,
			execution: options.execution ?? {
				source: { type: "discover" },
				approvedConfirmationKinds: approvedLandConfirmationKinds({ flags: parsedArgs }),
				hasSlotsExtension: options.hasSlotsExtension,
			},
			session,
		});
	} catch (error) {
		const failure = landingExecutionFailure(
			`land failed unexpectedly: ${formatErrorMessage(error)}`,
		);
		presentLandStackFailure({
			session,
			failure: failure,
		});
		return landOutcomeFailure(failure);
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

export function parseArgs(argsText: string): LandResult<ParsedArgs> {
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
			return landFailure(
				landingExecutionFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`),
			);
		}
		parsed[parsedFlag] = true;
	}

	return landSuccess(parsed);
}
