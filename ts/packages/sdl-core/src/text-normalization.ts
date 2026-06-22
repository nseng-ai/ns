export function normalizeTextOutput(output: string): string {
	return stripOuterCodeFence(trimOuterBlankLines(output.replace(/\r\n?/g, "\n")));
}

export function trimOuterBlankLines(text: string): string {
	const lines = text.split("\n");
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]?.trim() === "") {
		start += 1;
	}
	while (end > start && lines[end - 1]?.trim() === "") {
		end -= 1;
	}
	return lines.slice(start, end).join("\n");
}

export function stripOuterCodeFence(text: string): string {
	const trimmed = trimOuterBlankLines(text);
	const lines = trimmed.split("\n");
	const firstLine = lines[0]?.trim() ?? "";
	const lastLine = lines[lines.length - 1]?.trim() ?? "";
	if (lines.length >= 2 && /^```[a-zA-Z0-9_-]*$/.test(firstLine) && lastLine === "```") {
		return trimOuterBlankLines(lines.slice(1, -1).join("\n"));
	}
	return trimmed;
}
