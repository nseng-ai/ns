import { isRecord } from "./cmux/primitives.ts";

export interface CustomMessageTextPart {
	type: string;
	text?: string;
}
export type CustomMessageContent = string | CustomMessageTextPart[];

export interface PrLink {
	number: number;
	url: string;
}

export interface PrLinksDetails {
	prLinks: PrLink[];
}

const TERMINAL_ESCAPE_PATTERN = /\x1B(?:\](?:[^\x07\x1B]|\x1B(?!\\))*?(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripTerminalEscapes(text: string): string {
	return text.replace(TERMINAL_ESCAPE_PATTERN, "");
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

export function terminalHyperlink(text: string, sanitizedUrl: string): string {
	return `\x1B]8;;${sanitizedUrl}\x07${text}\x1B]8;;\x07`;
}

export function customMessageText(content: CustomMessageContent): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

export function truncateDisplayLine(line: string, width: number): string {
	if (width <= 0) return "";
	if (line.length <= width) return line;
	if (width === 1) return "…";
	return `${line.slice(0, width - 1)}…`;
}

export function prLinksFromDetails(details: unknown): Map<number, string> {
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

export function prLinksDetailsFor(
	entries: Iterable<{ number: number; url?: string | null | undefined }>,
): PrLinksDetails | undefined {
	const prLinks: PrLink[] = [];
	for (const entry of entries) {
		if (!Number.isInteger(entry.number) || entry.url === undefined || entry.url === null) continue;
		const sanitizedUrl = sanitizeTerminalHyperlinkUrl(entry.url);
		if (sanitizedUrl) {
			prLinks.push({ number: entry.number, url: sanitizedUrl });
		}
	}

	return prLinks.length > 0 ? { prLinks } : undefined;
}

export function linkifyPrReferences(line: string, prLinks: ReadonlyMap<number, string>): string {
	return line.replace(/#(\d+)\b/g, (match, numberText: string) => {
		const url = prLinks.get(Number(numberText));
		return url ? terminalHyperlink(match, url) : match;
	});
}
