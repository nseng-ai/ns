export type ExtractedFrontmatter = {
	frontmatterText: string;
	body: string;
};

function firstLineEnd(markdown: string): { line: string; nextOffset: number } {
	const newline = markdown.indexOf("\n");
	if (newline === -1) {
		return { line: markdown.endsWith("\r") ? markdown.slice(0, -1) : markdown, nextOffset: markdown.length };
	}

	const rawLine = markdown.slice(0, newline);
	return {
		line: rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine,
		nextOffset: newline + 1,
	};
}

export function extractFrontmatter(markdown: string): ExtractedFrontmatter {
	const first = firstLineEnd(markdown);
	if (first.line !== "---") {
		throw new Error("Stack plan Markdown must start with a frontmatter fence (`---`) on the first line.");
	}

	let lineStart = first.nextOffset;
	while (lineStart <= markdown.length) {
		const newline = markdown.indexOf("\n", lineStart);
		const lineEnd = newline === -1 ? markdown.length : newline;
		const rawLine = markdown.slice(lineStart, lineEnd);
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

		if (line === "---") {
			return {
				frontmatterText: markdown.slice(first.nextOffset, lineStart),
				body: newline === -1 ? "" : markdown.slice(newline + 1),
			};
		}

		if (newline === -1) {
			break;
		}
		lineStart = newline + 1;
	}

	throw new Error("Stack plan Markdown frontmatter fence is unclosed; expected a line containing only `---`.");
}
