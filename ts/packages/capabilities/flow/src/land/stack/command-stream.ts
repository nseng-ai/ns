import { createCommandIo } from "@nseng-ai/sdk/command-io";
import type { ActiveOperation, NsCommandIo } from "@nseng-ai/sdk";
import {
	commandSucceeded,
	type ExecResult,
	formatCommand,
	formatCommandTermination,
} from "@nseng-ai/foundation/command";
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	customMessageText,
	linkifyPrReferences,
	prLinksDetailsFor,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@nseng-ai/foundation/terminal-presentation";
import { commandStreamOutputLines } from "./command-exec.ts";
import { normalizeLandCommandFinish } from "./graphite-command-channel.ts";
import { COMMAND_STREAM_MESSAGE_TYPE, STATUS_KEY } from "./constants.ts";
import {
	commandExternalCallTelemetryEvent,
	type FlowLandExternalCallTelemetrySink,
} from "./external-call-telemetry.ts";
import type { LandMatrixProgressSink } from "../land-matrix-progress.ts";
import type { LandedPullRequest } from "../types.ts";
import type {
	CommandInvocation,
	CommandStreamMessageDetails,
	CustomMessage,
	LandStackExtensionAPI,
	LandStackCommandContext,
	RenderComponent,
	RenderTheme,
} from "./types.ts";

export interface LandLiveProgressEvent {
	prNumber: number;
	branch: string;
}

export type LandLiveProgressSink = (event: LandLiveProgressEvent) => void;

export interface FlowLandObservabilityChannels {
	readonly progressIo?: NsCommandIo;
	readonly liveProgress?: LandLiveProgressSink;
	readonly landMatrix?: LandMatrixProgressSink;
	readonly externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
}

interface LandStackCommandStreamOptions {
	/** Emit transient "running command" status. Off for non-interactive CLI. */
	shouldShowRunningCommandStatus?: boolean;
	/** Mirror completed-command results to text-only fallback sinks. */
	shouldMirrorFinishedCommandsToNonUi?: boolean;
	/** Injectable clock for stable command-duration and telemetry tests. */
	clock?: Clock;
	/** Flow-owned structured live-progress side channel. */
	liveProgress?: LandLiveProgressSink;
	/** Flow-owned structured matrix progress sink. */
	landMatrix?: LandMatrixProgressSink;
	/** Flow-owned structured external-call telemetry side channel. */
	externalCallTelemetry?: FlowLandExternalCallTelemetrySink;
}

export function landCommandStreamObservabilityOptions(
	channels: FlowLandObservabilityChannels,
): Pick<LandStackCommandStreamOptions, "liveProgress" | "landMatrix" | "externalCallTelemetry"> {
	return {
		...optionalEntry("liveProgress", channels.liveProgress),
		...optionalEntry("landMatrix", channels.landMatrix),
		...optionalEntry("externalCallTelemetry", channels.externalCallTelemetry),
	};
}

/**
 * Builds the Pi-slash-command NsCommandIo for land orchestration. Transient
 * running-command status maps to the Pi status footer; durable command-stream
 * entries become `COMMAND_STREAM_MESSAGE_TYPE` custom scrollback messages (with
 * optional PR-link details) rendered by `registerLandStackRenderer`. CLI surfaces
 * build a text-only NsCommandIo in the Flow command runner, so the same `LandStackCommandStream`
 * emission path serves both without per-call branching.
 */
export function createLandUiCommandIo(
	pi: Pick<LandStackExtensionAPI, "sendMessage">,
	ctx: Pick<LandStackCommandContext, "ui">,
): NsCommandIo {
	return createCommandIo({
		phaseSticky: (value) => ctx.ui.setStatus(STATUS_KEY, value),
		notifyUi: (message, level) => ctx.ui.notify(message, level),
		richMessage: (text, { details }) => {
			const customMessage: CustomMessage = {
				customType: COMMAND_STREAM_MESSAGE_TYPE,
				content: text,
				display: true,
			};
			if (details !== undefined) {
				customMessage.details = details;
			}
			pi.sendMessage?.(customMessage);
		},
	});
}

export class LandStackCommandStream {
	private readonly io: NsCommandIo;
	private readonly shouldShowRunningCommandStatus: boolean;
	private readonly shouldMirrorFinishedCommandsToNonUi: boolean;
	private readonly clock: Clock;
	private readonly liveProgress: LandLiveProgressSink | undefined;
	private readonly landMatrix: LandMatrixProgressSink | undefined;
	private readonly externalCallTelemetry: FlowLandExternalCallTelemetrySink | undefined;
	private readonly commandStarts = new Map<string, CommandStart>();
	private readonly activeOperations: ActiveOperation[] = [];

	constructor(io: NsCommandIo, options: LandStackCommandStreamOptions = {}) {
		this.io = io;
		this.shouldShowRunningCommandStatus = options.shouldShowRunningCommandStatus ?? false;
		this.shouldMirrorFinishedCommandsToNonUi = options.shouldMirrorFinishedCommandsToNonUi ?? true;
		this.clock = options.clock ?? systemClock;
		this.liveProgress = options.liveProgress;
		this.landMatrix = options.landMatrix;
		this.externalCallTelemetry = options.externalCallTelemetry;
	}

	get matrix(): LandMatrixProgressSink | undefined {
		return this.landMatrix;
	}

	emitLiveProgress(event: LandLiveProgressEvent): void {
		this.liveProgress?.(event);
		this.landMatrix?.recordMergedPr(event.prNumber);
	}

	start(invocation: CommandInvocation): void {
		this.commandStarts.set(invocation.display, {
			startedAtMs: this.clock.nowMs(),
			command: invocation.command,
			args: [...invocation.args],
		});
		// Keep active subprocess visibility transient: completed command results are
		// emitted separately, so a long-running Graphite/GitHub command does not pin a
		// rewritten widget above the editor while it is still pending.
		this.activeOperations.push({ kind: "command", display: invocation.display });
		this.landMatrix?.setActiveOperations(this.activeOperations);
		if (this.shouldShowRunningCommandStatus) {
			this.io.phase(`land: running ${invocation.display}...`);
		}
	}

	finish(invocation: CommandInvocation, finish: { result: ExecResult; note?: string }): void {
		const result = finish.result;
		const isSuccessful = commandSucceeded(result);
		const icon = isSuccessful ? "✓" : "✗";
		const commandStart = this.takeCommandStart(invocation.display);
		const elapsedMs =
			commandStart === undefined
				? undefined
				: Math.max(0, this.clock.nowMs() - commandStart.startedAtMs);
		if (commandStart !== undefined && elapsedMs !== undefined) {
			this.externalCallTelemetry?.(
				commandExternalCallTelemetryEvent({
					command: commandStart.command,
					args: commandStart.args,
					commandDisplay: invocation.display,
					elapsedMs,
					result,
				}),
			);
		}
		this.removeRunningCommand(invocation.display);
		this.landMatrix?.setActiveOperations(this.activeOperations);
		const suffix = formatCommandFinishSuffix(result, finish.note, elapsedMs);
		const lines = [`${icon} $ ${invocation.display}${suffix}`];
		if (!isSuccessful) {
			lines.push(...commandStreamOutputLines(result));
		}
		this.io.message(lines.join("\n"), {
			level: isSuccessful ? "info" : "error",
			isRichOnly: !this.shouldMirrorFinishedCommandsToNonUi,
		});
	}

	finishSuccess(message: string, details?: CommandStreamMessageDetails): void {
		this.io.message(formatCommandStreamBlock("✓", message), {
			isRichOnly: true,
			...(details === undefined ? {} : { details }),
		});
	}

	finishFailure(message: string): void {
		this.io.message(formatCommandStreamBlock("✗", message), { isRichOnly: true });
	}

	note(message: string): void {
		this.io.message(formatCommandStreamBlock("→", message), { level: "info" });
	}

	private removeRunningCommand(commandDisplay: string): void {
		const index = this.activeOperations.findIndex(
			(operation) => operation.kind === "command" && operation.display === commandDisplay,
		);
		if (index >= 0) this.activeOperations.splice(index, 1);
	}

	private takeCommandStart(commandDisplay: string): CommandStart | undefined {
		const commandStart = this.commandStarts.get(commandDisplay);
		if (commandStart === undefined) return undefined;
		this.commandStarts.delete(commandDisplay);
		return commandStart;
	}
}

interface CommandStart {
	startedAtMs: number;
	command: string;
	args: readonly string[];
}

function formatCommandFinishSuffix(
	result: ExecResult,
	note: string | undefined,
	elapsedMs: number | undefined,
): string {
	const parts: string[] = [];
	if (!commandSucceeded(result)) {
		parts.push(formatCommandTermination(result));
	}
	if (note) parts.push(note);
	if (elapsedMs !== undefined) parts.push(`finished in ${formatElapsedMs(elapsedMs)}`);
	return parts.length === 0 ? "" : ` — ${parts.join(" — ")}`;
}

export function withCommandStreaming(
	pi: LandStackExtensionAPI,
	commandStream: LandStackCommandStream,
): LandStackExtensionAPI {
	const wrapped: LandStackExtensionAPI = {
		async exec(command, args, options) {
			const invocation = commandInvocationForDisplay(command, args);
			commandStream.start(invocation);
			const result = await pi.exec(command, args, options);
			const finish = normalizeLandCommandFinish(command, args, result);
			commandStream.finish(invocation, finish);
			return finish.result;
		},
	};
	if (pi.registerMessageRenderer !== undefined) {
		wrapped.registerMessageRenderer = (customType, renderer) => {
			pi.registerMessageRenderer?.(customType, renderer);
		};
	}
	if (pi.sendMessage !== undefined) {
		wrapped.sendMessage = (message, options) => {
			pi.sendMessage?.(message, options);
		};
	}
	return wrapped;
}

function commandInvocationForDisplay(command: string, args: readonly string[]): CommandInvocation {
	return {
		command,
		args: [...args],
		display: formatCommandForDisplay(command, args),
	};
}

export function formatCommandForDisplay(command: string, args: readonly string[]): string {
	return formatCommand(command, displayArgsForCommand(command, args));
}

function displayArgsForCommand(command: string, args: readonly string[]): string[] {
	if (command !== "gh" || args[0] !== "pr" || args[1] !== "merge") {
		return [...args];
	}

	const displayArgs = [...args];
	const bodyIndex = displayArgs.indexOf("--body");
	if (bodyIndex >= 0 && bodyIndex + 1 < displayArgs.length) {
		displayArgs[bodyIndex + 1] = "<PR body>";
	}
	return displayArgs;
}

export function renderCommandStreamMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	const prLinks = prLinksFromDetails(message.details);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line) =>
					theme.fg(commandStreamLineColor(line), renderCommandStreamLine(line, prLinks, width)),
				);
		},
		invalidate(): void {},
	};
}

export function renderCommandStreamLine(
	line: string,
	prLinks: ReadonlyMap<number, string>,
	width: number,
): string {
	const truncated = truncateDisplayLine(line, width);
	if (prLinks.size === 0) return truncated;
	return linkifyPrReferences(truncated, prLinks);
}

export function commandStreamDetailsForLanded(
	landed: LandedPullRequest[],
): CommandStreamMessageDetails | undefined {
	return prLinksDetailsFor(landed);
}

export function commandStreamLineColor(line: string): string {
	if (line.startsWith("✓")) return "success";
	if (line.startsWith("✗")) return "error";
	if (line.startsWith("→")) return "accent";
	return "dim";
}

export function formatCommandStreamBlock(icon: string, message: string): string {
	const lines = message.split("\n");
	const first = lines.shift() ?? "";
	const formatted = [first ? `${icon} ${first}` : icon];
	for (const line of lines) {
		formatted.push(line ? `  ${line}` : "");
	}
	return formatted.join("\n");
}
