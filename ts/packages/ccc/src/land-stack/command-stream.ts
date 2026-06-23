import { formatCommand, normalizeExecResult, type ExecResult } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	customMessageText,
	linkifyPrReferences,
	prLinksDetailsFor,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@sdl/pi-extension-runtime/terminal-presentation";
import { commandStreamOutputLines, normalizeCommandFinish } from "./command-exec.ts";
import { COMMAND_STREAM_MESSAGE_TYPE, STATUS_KEY } from "./constants.ts";
import type {
	CommandStreamMessageDetails,
	CustomMessage,
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	NotifyLevel,
	RenderComponent,
	RenderTheme,
} from "./types.ts";

interface AppendCommandStreamMessageOptions {
	message: string;
	details?: CommandStreamMessageDetails;
	shouldMirrorToNonUi?: boolean;
	level?: NotifyLevel;
}

interface LandStackCommandStreamOptions {
	shouldMirrorFinishedCommandsToNonUi?: boolean;
}

export class LandStackCommandStream {
	private readonly pi: LandStackExtensionAPI;
	private readonly ctx: LandStackCommandContext;
	private readonly shouldMirrorFinishedCommandsToNonUi: boolean;

	constructor(
		pi: LandStackExtensionAPI,
		ctx: LandStackCommandContext,
		options: LandStackCommandStreamOptions = {},
	) {
		this.pi = pi;
		this.ctx = ctx;
		this.shouldMirrorFinishedCommandsToNonUi = options.shouldMirrorFinishedCommandsToNonUi ?? true;
	}

	start(commandDisplay: string): void {
		// Keep active subprocess visibility transient. Completed command results are
		// appended separately, so the chat log does not pin a rewritten widget above
		// the editor while a long-running Graphite/GitHub command is still pending.
		if (this.ctx.hasUI) {
			this.ctx.ui.setStatus(STATUS_KEY, `land: running ${commandDisplay}...`);
		}
	}

	finish(commandDisplay: string, finish: { result: ExecResult; note?: string }): void {
		const result = finish.result;
		const icon = result.code === 0 ? "✓" : "✗";
		const suffix =
			result.code === 0
				? finish.note
					? ` — ${finish.note}`
					: ""
				: ` — exit ${result.code}${result.killed ? " (killed or timed out)" : ""}${finish.note ? ` — ${finish.note}` : ""}`;
		const lines = [`${icon} $ ${commandDisplay}${suffix}`];
		if (result.code !== 0) {
			lines.push(...commandStreamOutputLines(result));
		}
		this.append({
			message: lines.join("\n"),
			shouldMirrorToNonUi: this.shouldMirrorFinishedCommandsToNonUi,
			level: result.code === 0 ? "info" : "error",
		});
	}

	finishSuccess(message: string, details?: CommandStreamMessageDetails): void {
		this.append({
			message: formatCommandStreamBlock("✓", message),
			...(details === undefined ? {} : { details }),
		});
	}

	finishFailure(message: string): void {
		this.append({ message: formatCommandStreamBlock("✗", message) });
	}

	note(message: string): void {
		this.append({
			message: formatCommandStreamBlock("→", message),
			shouldMirrorToNonUi: true,
			level: "info",
		});
	}

	private append(options: AppendCommandStreamMessageOptions): void {
		const { message, details } = options;
		if (this.ctx.hasUI && this.pi.sendMessage) {
			const customMessage: CustomMessage = {
				customType: COMMAND_STREAM_MESSAGE_TYPE,
				content: message,
				display: true,
			};
			if (details) {
				customMessage.details = details;
			}
			this.pi.sendMessage(customMessage);
		}
		if (!this.ctx.hasUI && options.shouldMirrorToNonUi === true) {
			this.ctx.ui.notify(message, options.level ?? "info");
		}
	}
}

export function withCommandStreaming(
	pi: LandStackExtensionAPI,
	commandStream: LandStackCommandStream,
): LandStackExtensionAPI {
	const wrapped: LandStackExtensionAPI = {
		async exec(command, args, options) {
			const commandDisplay = formatCommandForDisplay(command, args);
			commandStream.start(commandDisplay);
			try {
				const rawResult = await pi.exec(command, args, options);
				const normalizedResult = normalizeExecResult(rawResult);
				const finish = normalizeCommandFinish(command, args, normalizedResult);
				commandStream.finish(commandDisplay, finish);
				return finish.result;
			} catch (error) {
				const result: ExecResult = {
					stdout: "",
					stderr: formatErrorMessage(error),
					code: 1,
					killed: false,
				};
				commandStream.finish(commandDisplay, { result });
				return result;
			}
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
