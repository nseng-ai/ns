import { stripTerminalEscapes } from "../exec.ts";

export interface SubmitPrLink {
	label: string;
	url: string;
}

export function extractPrLinks(output: string): SubmitPrLink[] {
	const strippedOutput = stripTerminalEscapes(output);
	const links: SubmitPrLink[] = [];
	const seenUrls = new Set<string>();

	for (const match of strippedOutput.matchAll(/https?:\/\/[^\s<>"'\u0060]+/g)) {
		const rawUrl = match[0];
		const url = trimTerminalPunctuation(rawUrl);
		if (seenUrls.has(url)) continue;

		const link = toPrLink(url);
		if (link === undefined) continue;

		seenUrls.add(url);
		links.push(link);
	}

	return links;
}

export function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1] !== undefined) return graphiteMatch[1];

	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}

function toPrLink(url: string): SubmitPrLink | undefined {
	const prNumber = prNumberFromUrl(url);
	if (prNumber !== undefined) return { label: `#${prNumber}`, url };
	if (isPotentialPrUrl(url)) return { label: url, url };
	return undefined;
}

function isPotentialPrUrl(url: string): boolean {
	return /^https:\/\/app\.graphite\.com\/github\/pr\//.test(url) || /^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\//.test(url);
}

function trimTerminalPunctuation(url: string): string {
	let trimmed = url;
	while (/[),.;:!?}\]]$/.test(trimmed)) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed;
}
