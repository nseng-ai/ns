import { createCommandIo } from "@ji/kernel/command-io";
import type { SdlCommandIo } from "@ji/kernel/sdk";
import { type ExecResult, formatCommand, runNormalizedExecResult } from "@ji/core/command";
import { formatElapsedMs } from "@ji/core/time-format";
import {
	customMessageText,
	linkifyPrReferences,
	prLinksDetailsFor,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@ji/core/terminal-presentation";
import { commandStreamOutputLines } from "./command-exec.ts";
import { normalizeLandCommandFinish } from "./graphite-command-channel.ts";
import { COMMAND_STREAM_MESSAGE_TYPE, STATUS_KEY } from "./constants.ts";
import type {
	CommandStreamMessageDetails,
	CustomMessage,
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	RenderComponent,
	RenderTheme,
} from "./types.ts";

export interface LandLiveProgressEvent {
	prNumber: number;
	branch: string;
}

export type LandLiveProgressSink = (event: LandLiveProgressEvent) => void;

interface LandStackCommandStreamOptions {
	/** Emit transient "running command" status. Off for non-interactive CLI. */
	shouldShowRunningCommandStatus?: boolean;
	/** Mirror completed-command results to text-only fallback sinks. */
	shouldMirrorFinishedCommandsToNonUi?: boolean;
	/** Injectable clock for stable command-duration tests. */
	nowMs?: () => number;
	/** Flow-owned structured live-progress side channel. */
	liveProgress?: LandLiveProgressSink;
}

/**
 * Builds the Pi-slash-command SdlCommandIo for land orchestration. Transient
 * running-command status maps to the Pi status footer; durable command-stream
 * entries become `COMMAND_STREAM_MESSAGE_TYPE` custom scrollback messages (with
 * optional PR-link details) rendered by `registerLandStackRenderer`. CLI surfaces
 * build a text-only SdlCommandIo in the Flow command runner, so the same `LandStackCommandStream`
 * emission path serves both without per-call branching.
 */
export function createLandUiCommandIo(
	pi: Pick<LandStackExtensionAPI, "sendMessage">,
	ctx: Pick<LandStackCommandContext, "ui">,
): SdlCommandIo {
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
	private readonly io: SdlCommandIo;
	private readonly shouldShowRunningCommandStatus: boolean;
	private readonly shouldMirrorFinishedCommandsToNonUi: boolean;
	private readonly nowMs: () => number;
	private readonly liveProgress: LandLiveProgressSink | undefined;
	private readonly commandStarts = new Map<string, number>();

	constructor(io: SdlCommandIo, options: LandStackCommandStreamOptions = {}) {
		this.io = io;
		this.shouldShowRunningCommandStatus = options.shouldShowRunningCommandStatus ?? false;
		this.shouldMirrorFinishedCommandsToNonUi = options.shouldMirrorFinishedCommandsToNonUi ?? true;
		this.nowMs = options.nowMs ?? Date.now;
		this.liveProgress = options.liveProgress;
	}

	emitLiveProgress(event: LandLiveProgressEvent): void {
		this.liveProgress?.(event);
	}

	start(commandDisplay: string): void {
		this.commandStarts.set(commandDisplay, this.nowMs());
		// Keep active subprocess visibility transient: completed command results are
		// emitted separately, so a long-running Graphite/GitHub command does not pin a
		// rewritten widget above the editor while it is still pending.
		if (this.shouldShowRunningCommandStatus) {
			this.io.phase(`land: running ${commandDisplay}...`);
		}
	}

	finish(commandDisplay: string, finish: { result: ExecResult; note?: string }): void {
		const result = finish.result;
		const icon = result.code === 0 ? "✓" : "✗";
		const elapsedMs = this.takeElapsedMs(commandDisplay);
		const suffix = formatCommandFinishSuffix(result, finish.note, elapsedMs);
		const lines = [`${icon} $ ${commandDisplay}${suffix}`];
		if (result.code !== 0) {
			lines.push(...commandStreamOutputLines(result));
		}
		this.io.message(lines.join("\n"), {
			level: result.code === 0 ? "info" : "error",
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

	private takeElapsedMs(commandDisplay: string): number | undefined {
		const startedAt = this.commandStarts.get(commandDisplay);
		if (startedAt === undefined) return undefined;
		this.commandStarts.delete(commandDisplay);
		return Math.max(0, this.nowMs() - startedAt);
	}
}

function formatCommandFinishSuffix(
	result: ExecResult,
	note: string | undefined,
	elapsedMs: number | undefined,
): string {
	const parts: string[] = [];
	if (result.code !== 0) {
		parts.push(`exit ${result.code}${result.killed ? " (killed or timed out)" : ""}`);
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
			const commandDisplay = formatCommandForDisplay(command, args);
			commandStream.start(commandDisplay);
			const result = await runNormalizedExecResult(
				async () => await pi.exec(command, args, options),
			);
			const finish = normalizeLandCommandFinish(command, args, result);
			commandStream.finish(commandDisplay, finish);
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
	landed: LandedPr[],
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
