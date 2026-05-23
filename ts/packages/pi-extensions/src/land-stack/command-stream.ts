import { formatCommand, normalizeExecResult, type ExecResult } from "../command-runtime.ts";
import { commandStreamOutputLines, normalizeCommandFinish } from "./command-exec.ts";
import { COMMAND_STREAM_MESSAGE_TYPE } from "./constants.ts";
import { errorMessage } from "./errors.ts";
import type {
	CommandStreamMessageDetails,
	CommandStreamPrLink,
	CustomMessage,
	CustomMessageContent,
	ExtensionAPI,
	ExtensionCommandContext,
	LandedPr,
	RenderComponent,
	RenderTheme,
} from "./types.ts";

export class LandStackCommandStream {
	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionCommandContext,
	) {}

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

export function withCommandStreaming(pi: ExtensionAPI, commandStream: LandStackCommandStream): ExtensionAPI {
	return {
		registerCommand(name, options) {
			pi.registerCommand(name, options);
		},
		async exec(command, args, options) {
			const commandDisplay = formatCommand(command, args);
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
				throw error;
			}
		},
	};
}

export function renderCommandStreamMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	const prLinks = commandStreamPrLinks(message.details);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line) => theme.fg(commandStreamLineColor(line), renderCommandStreamLine(line, prLinks, width)));
		},
		invalidate(): void {},
	};
}

export function renderCommandStreamLine(line: string, prLinks: Map<number, string>, width: number): string {
	const truncated = truncateDisplayLine(line, width);
	if (prLinks.size === 0) return truncated;
	return linkifyPrReferences(truncated, prLinks);
}

export function linkifyPrReferences(line: string, prLinks: Map<number, string>): string {
	return line.replace(/#(\d+)\b/g, (match, numberText: string) => {
		const url = prLinks.get(Number(numberText));
		return url ? terminalHyperlink(match, url) : match;
	});
}

export function terminalHyperlink(text: string, url: string): string {
	return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}

export function commandStreamPrLinks(details: unknown): Map<number, string> {
	const links = new Map<number, string>();
	if (!isRecord(details) || !Array.isArray(details.prLinks)) return links;

	for (const rawLink of details.prLinks) {
		if (!isRecord(rawLink)) continue;
		const number = rawLink.number;
		const url = rawLink.url;
		if (typeof number !== "number" || !Number.isInteger(number) || typeof url !== "string") continue;
		const sanitizedUrl = sanitizeTerminalHyperlinkUrl(url);
		if (sanitizedUrl) {
			links.set(number, sanitizedUrl);
		}
	}
	return links;
}

export function sanitizeTerminalHyperlinkUrl(url: string): string | undefined {
	if (/\p{Cc}/u.test(url)) return undefined;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
		return parsed.toString();
	} catch {
		return undefined;
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function commandStreamDetailsForLanded(landed: LandedPr[]): CommandStreamMessageDetails | undefined {
	const prLinks: CommandStreamPrLink[] = [];
	for (const entry of landed) {
		if (entry.url) {
			prLinks.push({ number: entry.number, url: entry.url });
		}
	}
	return prLinks.length > 0 ? { prLinks } : undefined;
}

export function customMessageText(content: CustomMessageContent): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

export function commandStreamLineColor(line: string): string {
	if (line.startsWith("✓")) return "success";
	if (line.startsWith("✗")) return "error";
	if (line.startsWith("→")) return "accent";
	return "dim";
}

export function truncateDisplayLine(line: string, width: number): string {
	if (width <= 0) return "";
	if (line.length <= width) return line;
	if (width === 1) return "…";
	return `${line.slice(0, width - 1)}…`;
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
