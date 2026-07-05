import { runWithNsCommandIo } from "@ns/kernel/command-io";
import type { NsCommandIo, NsConfirmOptions } from "@ns/kernel/sdk";
import type { ExecOutputListener } from "@ns/core/command";
import { optionalEntry } from "@ns/core/primitives";
import { landArgumentCompletions, parseArgs, registerLandStackRenderer } from "./land-stack.ts";
import { createCliCommandIo } from "@ns/kernel/command-io";
import {
	createLandUiCommandIo,
	landCommandStreamObservabilityOptions,
	LandStackCommandStream,
	type FlowLandObservabilityChannels,
	type LandLiveProgressSink,
} from "./stack/command-stream.ts";
import type {
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
} from "./stack/external-call-telemetry.ts";
import { createLandRuntime } from "./stack/land-runtime.ts";
import { completed, failure, type LandStackOutcome } from "./stack/errors.ts";
import {
	formatFailureNotification,
	landFailureKind,
	notifyPrintAware,
	presentBrief,
	usage,
} from "./stack/presentation.ts";
import {
	renderLandConfirmationDetails,
	renderLandResultBlockFromMessage,
} from "./stack/land-presentation.ts";
import { runLandingDispatch } from "../land/landing-dispatch.ts";
import type { Caps } from "@ns/clinkr";
import type {
	AutocompleteItem,
	CustomMessage,
	LandResultKind,
	MessageRenderer,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";

export type { ExtensionMode, NotifyLevel, PrintOutput } from "./stack/types.ts";
export type {
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
	FlowLandObservabilityChannels,
};
export type { ValidPullRequestView } from "../land/isolated-fast-path.ts";
export { isIsolatedFastPath, parsePullRequestView } from "../land/isolated-fast-path.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type LandCommandContext = PrintAwareLandStackCommandContext;

export interface LandExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: LandCommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

const COMMAND_NAME = "ns:flow:land";
export function registerLandCommand(pi: LandExtensionAPI): void {
	registerLandStackRenderer(pi);

	pi.registerCommand(COMMAND_NAME, {
		description: "Land the current PR or Graphite stack into trunk",
		getArgumentCompletions: landArgumentCompletions,
		handler: async (rawArgs, ctx) => {
			await runLandCommand(pi, rawArgs, ctx);
		},
	});
}

export type LandCliConfirmPrompt = (
	title: string,
	message: string,
	options?: NsConfirmOptions,
) => Promise<boolean> | boolean;

type RunLandCommandOptions = FlowLandObservabilityChannels;

async function runLandCommand(
	pi: LandExtensionAPI,
	rawArgs: string,
	ctx: LandCommandContext,
	options: RunLandCommandOptions = {},
): Promise<LandStackOutcome> {
	const progressIo = options.progressIo;
	const args = parseArgs(rawArgs);
	if (args.type === "failure") {
		presentBrief({
			ctx,
			fullMessage: args.failure.message,
			level: args.failure.level,
			uiMessage: formatFailureNotification(args.failure),
			kind: landFailureKind(args.failure),
		});
		return failure(args.failure);
	}
	if (args.value.shouldShowHelp) {
		notifyPrintAware({ ctx, message: usage(), level: "info" });
		return completed();
	}

	await ctx.waitForIdle();

	const commandStream = new LandStackCommandStream(progressIo ?? createLandUiCommandIo(pi, ctx), {
		shouldShowRunningCommandStatus: progressIo !== undefined && ctx.hasUI,
		shouldMirrorFinishedCommandsToNonUi: false,
		...landCommandStreamObservabilityOptions(options),
	});
	const runtime = createLandRuntime(pi, commandStream);
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
 * This intentionally does not use `registerCliCommandExtension`: that helper lives
 * above Flow in `@ns/pi` and owns Pi slash-command registration and
 * rendering. This adapter must stay below that package so ns CLI execution can
 * reuse Flow land orchestration through the intentional private Flow/Pi package cycle.
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
	/** Optional progress sink; when omitted, the legacy CLI command stream is used. */
	progressIo?: NsCommandIo;
	/** Optional Flow-owned structured live-progress sink for dynamic land titles. */
	liveProgress?: LandLiveProgressSink;
	/** Optional Flow-owned structured external-call telemetry sink. */
	externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
	/**
	 * Resolved terminal caps for the house-style CLI result blocks (`resolveFlowStreamCaps` in the
	 * flow wrapper). When omitted, final result blocks render as plain text — the CLI surface stays
	 * un-styled rather than guessing caps, and the Pi command-stream path is never affected.
	 */
	caps?: Caps;
}

export async function runLandCli(input: LandCliInput): Promise<number> {
	let didRegister = false;
	const api: LandExtensionAPI = {
		registerCommand() {
			didRegister = true;
		},
		exec: input.exec,
	};
	registerLandCommand(api);
	if (!didRegister) {
		input.stderr("Land command registration failed.\n");
		return 1;
	}

	const confirm = input.confirm;
	const caps = input.caps;
	const progressIo = input.progressIo ?? createCliCommandIo(input);
	const observabilityChannels: FlowLandObservabilityChannels = {
		progressIo,
		...optionalEntry("liveProgress", input.liveProgress),
		...optionalEntry("externalCallTelemetry", input.externalCallTelemetry),
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
						setStatus: (_key, value) => {
							if (value !== undefined) progressIo.phase(value);
						},
					},
					waitForIdle: async () => {},
					// CLI-only house-style renderers. Wired only here, so the shared orchestration's
					// `presentBrief`/`notify` stay plain in the Pi command-stream path — ANSI never leaks into
					// `renderCommandStreamMessage` or non-interactive refusal text.
					...(caps === undefined
						? {}
						: {
								renderResultBlock: createCliResultBlockRenderer(caps),
								renderConfirmationDetails: (details) =>
									renderLandConfirmationDetails(caps, details),
							}),
				},
				observabilityChannels,
			),
	);
	return outcome.type === "failure" && outcome.failure.level === "error" ? 1 : 0;
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
