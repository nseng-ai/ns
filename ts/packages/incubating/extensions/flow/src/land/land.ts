import type { NsCommandIo, NsConfirmOptions } from "@nseng-ai/sdk";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	createLandCommandIo,
	landCommandStreamObservabilityOptions,
	LandStackCommandStream,
	type FlowLandObservabilityChannels,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import type { FlowLandExternalCallTelemetrySink } from "./stack/external-call-telemetry.ts";
import { createStackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import type { LandMatrixProgressSink } from "./land-matrix-progress.ts";
import { runLandingDispatch, type FlowLandWorkflowResult } from "./landing-dispatch.ts";
import type {
	LandExecutionApi,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";

export type { ExecResult } from "@nseng-ai/foundation/command";
export type { ExtensionMode, NotifyLevel, PrintOutput } from "./stack/types.ts";
export type {
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
} from "./stack/external-call-telemetry.ts";
export type { FlowLandObservabilityChannels };
export type { FlowLandWorkflowResult } from "./landing-dispatch.ts";
export type { ValidPullRequestView } from "./single-branch-fast-path.ts";
export { isSingleBranchFastPath, parsePullRequestView } from "./single-branch-fast-path.ts";

export type LandCommandContext = PrintAwareLandStackCommandContext;

export type LandConfirmPrompt = (
	title: string,
	message: string,
	options?: NsConfirmOptions,
) => Promise<boolean> | boolean;

export type LandSelectPrompt = (
	title: string,
	options: readonly string[],
) => Promise<string | undefined> | string | undefined;

export interface RunLandWorkflowInput extends FlowLandObservabilityChannels {
	readonly cwd: string;
	readonly request: ParsedArgs;
	readonly exec: LandExecutionApi["exec"];
	readonly confirm?: LandConfirmPrompt;
	readonly select?: LandSelectPrompt;
	readonly progressIo?: NsCommandIo;
	readonly liveProgress?: LandLiveProgressSink;
	readonly landMatrix?: LandMatrixProgressSink;
	readonly externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
}

/** Flow-owned semantic land workflow. Settled presentation belongs to the command edge. */
export async function runLandWorkflow(
	input: RunLandWorkflowInput,
): Promise<FlowLandWorkflowResult> {
	const api: LandExecutionApi = { exec: input.exec };
	const progressIo = input.progressIo;
	const ctx: PrintAwareLandStackCommandContext = {
		cwd: input.cwd,
		hasUI: input.confirm !== undefined,
		ui: {
			notify(message, level) {
				progressIo?.notify(message, level === "success" ? "info" : level);
			},
			confirm: async (title, message, options) =>
				input.confirm === undefined ? false : await input.confirm(title, message, options),
			...optionalEntry("select", input.select),
			setStatus: (_key, value) => {
				if (value !== undefined) progressIo?.phase(value);
			},
		},
		waitForIdle: async () => {},
	};
	await ctx.waitForIdle();
	const observabilityChannels: FlowLandObservabilityChannels = {
		...optionalEntry("progressIo", progressIo),
		...optionalEntry("liveProgress", input.liveProgress),
		...optionalEntry("landMatrix", input.landMatrix),
		...optionalEntry("externalCallTelemetry", input.externalCallTelemetry),
	};
	const commandStream = new LandStackCommandStream(progressIo ?? createLandCommandIo(api, ctx), {
		shouldShowRunningCommandStatus: progressIo !== undefined && ctx.hasUI,
		shouldMirrorFinishedCommandsToNonUi: false,
		...landCommandStreamObservabilityOptions(observabilityChannels),
	});
	const runtime = createStackLandingRuntime(api, commandStream);
	return await runLandingDispatch({
		runtime,
		ctx,
		parsedArgs: input.request,
		observabilityChannels,
	});
}
