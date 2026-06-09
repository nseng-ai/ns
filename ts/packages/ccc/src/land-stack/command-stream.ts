import { formatCommand, normalizeExecResult, type ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import {
	customMessageText,
	linkifyPrReferences,
	prLinksDetailsFor,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@asdl/pi-extension-runtime/terminal-presentation";
import { commandStreamOutputLines, normalizeCommandFinish } from "./command-exec.ts";
import { COMMAND_STREAM_MESSAGE_TYPE } from "./constants.ts";
import { errorMessage } from "./errors.ts";
import type {
	CommandStreamMessageDetails,
	CustomMessage,
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	RenderComponent,
	RenderTheme,
} from "./types.ts";

export class LandStackCommandStream {
	private readonly pi: LandStackExtensionAPI;
	private readonly ctx: LandStackCommandContext;

	constructor(pi: LandStackExtensionAPI, ctx: LandStackCommandContext) {
		this.pi = pi;
		this.ctx = ctx;
	}

	start(_commandDisplay: string): void {
		// The active operation is already reflected in the status line. Only completed
		// command results are appended to chat so the log scrolls naturally instead of
		// pinning a rewritten widget above the editor.
	}

	finish(commandDisplay: string, finish: { result: ExecResult; note?: string }): void {
		const result = finish.result;
		const icon = result.code === 0 ? "✓" : "✗";
		const suffix =
			result.code === 0
				? finish.note
					? ` — ${finish.note}`
					: ""
				: ` — exit ${result.code}${result.killed ? " (killed or timed out)" : ""}`;
		const lines = [`${icon} $ ${commandDisplay}${suffix}`];
		if (result.code !== 0) {
			lines.push(...commandStreamOutputLines(result));
		}
		this.append(lines.join("\n"));
	}

	finishSuccess(message: string, details?: CommandStreamMessageDetails): void {
		this.append(formatCommandStreamBlock("✓", message), details);
	}

	finishFailure(message: string): void {
		this.append(formatCommandStreamBlock("✗", message));
	}

	note(message: string): void {
		this.append(formatCommandStreamBlock("→", message));
	}

	private append(message: string, details?: CommandStreamMessageDetails): void {
		if (!this.ctx.hasUI || !this.pi.sendMessage) return;
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
}

export function withCommandStreaming(pi: LandStackExtensionAPI, commandStream: LandStackCommandStream): LandStackExtensionAPI {
	return {
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
				const result: ExecResult = { stdout: "", stderr: errorMessage(error), code: 1, killed: false };
				commandStream.finish(commandDisplay, { result });
				return result;
			}
		},
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
				.map((line) => theme.fg(commandStreamLineColor(line), renderCommandStreamLine(line, prLinks, width)));
		},
		invalidate(): void {},
	};
}

export function renderCommandStreamLine(line: string, prLinks: ReadonlyMap<number, string>, width: number): string {
	const truncated = truncateDisplayLine(line, width);
	if (prLinks.size === 0) return truncated;
	return linkifyPrReferences(truncated, prLinks);
}

export function commandStreamDetailsForLanded(landed: LandedPr[]): CommandStreamMessageDetails | undefined {
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
