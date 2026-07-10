import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";

export function mergePrLinks(
	first: readonly SubmitPrLink[],
	second: readonly SubmitPrLink[],
): SubmitPrLink[] {
	const links: SubmitPrLink[] = [];
	const seenKeys = new Set<string>();
	for (const link of [...first, ...second]) {
		const key = prLinkIdentityKey(link);
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		links.push({ ...link });
	}
	return links;
}

export function partitionPrLinksByExisting(
	links: readonly SubmitPrLink[],
	existingLinks: readonly SubmitPrLink[],
): { newPrLinks: SubmitPrLink[]; existingPrLinks: SubmitPrLink[] } {
	const existingKeys = new Set(existingLinks.map(prLinkIdentityKey));
	const newPrLinks: SubmitPrLink[] = [];
	const matchedExistingPrLinks: SubmitPrLink[] = [];
	for (const link of links) {
		if (existingKeys.has(prLinkIdentityKey(link))) {
			matchedExistingPrLinks.push(link);
		} else {
			newPrLinks.push(link);
		}
	}
	return { newPrLinks, existingPrLinks: matchedExistingPrLinks };
}

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

function prLinkIdentityKey(link: SubmitPrLink): string {
	const number = prNumberFromLink(link);
	return number === undefined ? link.url : `pr:${number}`;
}
