import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";

export function formatPrLinkText(link: SubmitPrLink): string {
	if (link.label === link.url) return link.url;
	return `${link.label} ${link.url}`;
}

export function formatPrLinkTextRow(link: SubmitPrLink): string {
	return `• ${formatPrLinkText(link)}`;
}

export function prNumberFromLink(link: SubmitPrLink): number | undefined {
	const value = prNumberFromUrl(link.url) ?? link.label.match(/^#(\d+)$/)?.[1];
	if (value === undefined) return undefined;
	const number = Number.parseInt(value, 10);
	return Number.isSafeInteger(number) ? number : undefined;
}
