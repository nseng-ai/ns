export interface BuildConciseTitleOptions {
	maxWords: number;
	maxChars: number;
}

export function buildConciseTitle(prompt: string, options: BuildConciseTitleOptions): string {
	const normalized = prompt.replace(/\s+/gu, " ").trim();
	const maxChars = Math.max(0, Math.floor(options.maxChars));
	if (normalized.length === 0 || maxChars === 0) return "";

	const maxWords = Math.max(1, Math.floor(options.maxWords));
	const words = normalized.split(" ");
	const wordLimitedTitle = words.slice(0, maxWords).join(" ");
	const isTruncated = words.length > maxWords || wordLimitedTitle.length > maxChars;
	if (!isTruncated) return wordLimitedTitle;
	if (maxChars === 1) return "…";

	const base = wordLimitedTitle
		.slice(0, maxChars - 1)
		.trimEnd()
		.replace(/…+$/u, "");
	return `${base}…`;
}
