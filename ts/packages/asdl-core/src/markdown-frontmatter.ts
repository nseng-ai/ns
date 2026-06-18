export type MarkdownLineEnding = "\n" | "\r\n";

export type MarkdownFrontmatterSplitResult =
	| { readonly type: "found"; readonly block: MarkdownFrontmatterBlock }
	| { readonly type: "not_found" }
	| { readonly type: "missing_closing_fence" };

export interface MarkdownFrontmatterBlock {
	readonly linesWithEndings: readonly string[];
	readonly openingIndex: 0;
	readonly closingIndex: number;
	readonly frontmatterLinesWithEndings: readonly string[];
	readonly frontmatterText: string;
	readonly body: string;
	readonly lineEnding: MarkdownLineEnding;
}

export function splitMarkdownFrontmatter(text: string): MarkdownFrontmatterSplitResult {
	const linesWithEndings = splitLinesKeepEndings(text);
	if (linesWithEndings.length === 0) return { type: "not_found" };
	if (stripLineEnding(linesWithEndings[0] ?? "") !== "---") return { type: "not_found" };

	const closingIndex = linesWithEndings.findIndex(
		(line, index) => index > 0 && stripLineEnding(line) === "---",
	);
	if (closingIndex === -1) return { type: "missing_closing_fence" };

	const frontmatterLinesWithEndings = linesWithEndings.slice(1, closingIndex);
	return {
		type: "found",
		block: {
			linesWithEndings,
			openingIndex: 0,
			closingIndex,
			frontmatterLinesWithEndings,
			frontmatterText: frontmatterLinesWithEndings.join(""),
			body: linesWithEndings.slice(closingIndex + 1).join(""),
			lineEnding: firstLineEnding(text) ?? "\n",
		},
	};
}

export function splitLinesKeepEndings(text: string): readonly string[] {
	if (text.length === 0) return [];
	return text.match(/.*(?:\r\n|\n|$)/gu)?.filter((line) => line.length > 0) ?? [];
}

export function stripLineEnding(line: string): string {
	return line.replace(/\r?\n$/u, "");
}

export function firstLineEnding(text: string): MarkdownLineEnding | undefined {
	const match = /\r\n|\n/u.exec(text);
	if (match === null) return undefined;
	return match[0] === "\r\n" ? "\r\n" : "\n";
}
