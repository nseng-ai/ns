import { runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import type { NsCommandIo, NsConfirmOptions, NsSelectPrompt } from "@nseng-ai/sdk";
import type { ExecOutputListener, ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { parseArgs } from "./land-stack.ts";
import { createCliCommandIo } from "@nseng-ai/sdk/command-io";
import {
	createLandCommandIo,
	landCommandStreamObservabilityOptions,
	LandStackCommandStream,
	withCommandStreaming,
	type FlowLandObservabilityChannels,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import type {
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
} from "./stack/external-call-telemetry.ts";
import { createStackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import { createBranchLandContext } from "./stack/land-context-adapter.ts";
import { executeLanding } from "./api.ts";
import { createFlowLandConfirmationGateway } from "./flow-land-confirmation-gateway.ts";
import { createFlowLandExecutionProgress } from "./landing-execution.ts";
import { landingCleanupPolicyFromArgs } from "./post-landing-slot-cleanup.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import {
	failureLevel,
	notifyPrintAware,
	presentFailureAndReturn,
	renderLandResultBlockFromMessage,
	usage,
} from "./land-presentation.ts";
import type { LandMatrixProgressSink } from "./land-matrix-progress.ts";
import { runLandingDispatch } from "../land/landing-dispatch.ts";
import type { Caps } from "@nseng-ai/clinkr";
import type { RepositoryWorkflowTarget } from "@nseng-ai/extension-kit/workflow-target";
import type {
	LandResultKind,
	LandExecutionApi,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";

export type { ExecResult } from "@nseng-ai/foundation/command";
export type { ExtensionMode, NotifyLevel, PrintOutput } from "./stack/types.ts";
export type {
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
	FlowLandObservabilityChannels,
};
export type { ValidPullRequestView } from "../land/single-branch-fast-path.ts";
export { isSingleBranchFastPath, parsePullRequestView } from "../land/single-branch-fast-path.ts";

export type LandCommandContext = PrintAwareLandStackCommandContext;

export type LandCliConfirmPrompt = (
	title: string,
	message: string,
	options?: NsConfirmOptions,
) => Promise<boolean> | boolean;

type RunLandCommandOptions = FlowLandObservabilityChannels & {
	readonly workflowTarget?: RepositoryWorkflowTarget;
};

async function runLandCommand(
	pi: LandExecutionApi,
	rawArgs: string,
	ctx: LandCommandContext,
	options: RunLandCommandOptions = {},
): Promise<LandOutcome> {
	const progressIo = options.progressIo;
	const args = parseArgs(rawArgs);
	if (args.type === "failure") {
		presentFailureAndReturn(ctx, args.failure);
		return landOutcomeFailure(args.failure);
	}
	if (args.value.shouldShowHelp) {
		notifyPrintAware({ ctx, message: usage(), level: "info" });
		return landCompleted();
	}

	await ctx.waitForIdle();

	const commandStream = new LandStackCommandStream(progressIo ?? createLandCommandIo(pi, ctx), {
		shouldShowRunningCommandStatus: progressIo !== undefined && ctx.hasUI,
		shouldMirrorFinishedCommandsToNonUi: false,
		...landCommandStreamObservabilityOptions(options),
	});
	if (options.workflowTarget?.type === "branch") {
		const commands = withCommandStreaming(pi, commandStream);
		const context = createBranchLandContext(commands);
		const branch = await context.git.currentBranch({ repoRoot: ctx.cwd });
		if (branch.type === "failure") {
			presentFailureAndReturn(ctx, branch.failure);
			return landOutcomeFailure(branch.failure);
		}
		const result = await executeLanding({
			context,
			request: {
				cwd: ctx.cwd,
				target: { type: "branch", branch: branch.value },
				mode: args.value.isDryRun ? "dry-run" : "execute",
				preflight: { shouldAllowSubmitRequiredState: false },
				cleanup: landingCleanupPolicyFromArgs(args.value),
				continuation: { type: "none" },
			},
			host: {
				confirmation: createFlowLandConfirmationGateway(ctx),
				progress: createFlowLandExecutionProgress({
					commandStream,
					progress: {
						note: (message) => commandStream.note(message),
						setStatus: (message) => ctx.ui.setStatus("land", message),
					},
				}),
			},
			source: { type: "discover" },
		});
		if (result.type === "failed") {
			presentFailureAndReturn(ctx, result.failure);
			return landOutcomeFailure(result.failure);
		}
		return landCompleted();
	}
	const runtime = createStackLandingRuntime(pi, commandStream);
	return await runLandingDispatch({
		runtime,
		ctx,
		parsedArgs: args.value,
		observabilityChannels: options,
	});
}

/**
 * Lower-level adapter used by the ns CLI extension.
 *
 * This intentionally does not use `registerCliCommandExtension`: that helper belongs
 * to the separate Pi host adapter and owns slash-command registration and rendering.
 * This adapter stays host-independent so ns CLI execution can reuse Flow land
 * orchestration without a dependency on Pi presentation.
 */
export interface LandCliInput {
	cwd: string;
	rawArgs: string;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ExecOutputListener;
	confirm?: LandCliConfirmPrompt;
	select?: NsSelectPrompt;
	/** Optional progress sink; when omitted, the legacy CLI command stream is used. */
	progressIo?: NsCommandIo;
	/** Optional Flow-owned structured live-progress sink for dynamic land titles. */
	liveProgress?: LandLiveProgressSink;
	/** Optional Flow-owned structured matrix sink. */
	landMatrix?: LandMatrixProgressSink;
	/** Optional Flow-owned structured external-call telemetry sink. */
	externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
	/** Explicit repository workflow target selected by the ns command composition root. */
	workflowTarget?: RepositoryWorkflowTarget;
	/**
	 * Resolved terminal caps for the house-style CLI result blocks (`resolveFlowStreamCaps` in the
	 * flow wrapper). When omitted, final result blocks render as plain text — the CLI surface stays
	 * un-styled rather than guessing caps, and the Pi command-stream path is never affected.
	 */
	caps?: Caps;
}

export async function runLandCli(input: LandCliInput): Promise<number> {
	const api: LandExecutionApi = { exec: input.exec };
	const confirm = input.confirm;
	const caps = input.caps;
	const progressIo = input.progressIo ?? createCliCommandIo(input);
	const observabilityChannels: FlowLandObservabilityChannels = {
		progressIo,
		...optionalEntry("liveProgress", input.liveProgress),
		...optionalEntry("landMatrix", input.landMatrix),
		...optionalEntry("externalCallTelemetry", input.externalCallTelemetry),
		...optionalEntry("workflowTarget", input.workflowTarget),
	};
	const outcome = await runWithNsCommandIo(
		progressIo,
		async () =>
			await runLandCommand(
				api,
				input.rawArgs,
				{
					cwd: input.cwd,
					hasUI: confirm !== undefined,
					ui: {
						notify(message, level) {
							progressIo.notify(message, level === "success" ? "info" : level);
						},
						confirm: async (title, message, options) =>
							confirm === undefined ? false : await confirm(title, message, options),
						...optionalEntry("select", input.select),
						setStatus: (_key, value) => {
							if (value !== undefined) progressIo.phase(value);
						},
					},
					waitForIdle: async () => {},
					// CLI-only house-style renderer. Shared orchestration stays plain and portable.
					...optionalEntry(
						"renderResultBlock",
						caps === undefined ? undefined : createCliResultBlockRenderer(caps),
					),
				},
				observabilityChannels,
			),
	);
	return outcome.type === "failure" && failureLevel(outcome.failure) === "error" ? 1 : 0;
}

/**
 * Build the CLI result-block renderer: split a settled message's first line into the bold +
 * intent-painted + glyph headline and render the remainder as normal-weight body (house-style §4).
 * Domain-authored detail (partial-success lists, failure cause + command details, recovery guidance)
 * is preserved verbatim in the body so recovery text is never lost.
 */
function createCliResultBlockRenderer(
	caps: Caps,
): (kind: LandResultKind, message: string) => string {
	return (kind, message) => renderLandResultBlockFromMessage(caps, { kind, message });
}
