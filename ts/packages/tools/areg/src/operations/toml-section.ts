export function renderAregSection(agents: readonly string[]): string {
	return `[areg]\nagents = ${JSON.stringify([...agents])}\n`;
}

export function replaceOrAppendAregSection(content: string, agents: readonly string[]): string {
	const lines = content.split(/(?<=\n)/u);
	if (lines.length === 1 && lines[0] === "") lines.pop();
	const start = aregSectionStart(lines);
	if (start === undefined) return appendTomlSection(content, renderAregSection(agents));
	const end = tomlSectionEnd(lines, start);
	let replacement = renderAregSection(agents);
	if (end < lines.length) replacement += "\n";
	lines.splice(
		start,
		end - start,
		...(replacement.match(/.*(?:\n|$)/gu)?.filter((line) => line.length > 0) ?? []),
	);
	return lines.join("");
}

function appendTomlSection(content: string, section: string): string {
	if (content.length === 0) return section;
	if (content.endsWith("\n\n")) return `${content}${section}`;
	if (content.endsWith("\n")) return `${content}\n${section}`;
	return `${content}\n\n${section}`;
}

function aregSectionStart(lines: readonly string[]): number | undefined {
	for (let index = 0; index < lines.length; index += 1) {
		if (tomlTableName(lines[index] ?? "") === "areg") return index;
	}
	return undefined;
}

function tomlSectionEnd(lines: readonly string[], start: number): number {
	for (let index = start + 1; index < lines.length; index += 1) {
		if (tomlTableName(lines[index] ?? "") !== null) return index;
	}
	return lines.length;
}

function tomlTableName(line: string): string | null {
	const stripped = line.trim();
	if (stripped.startsWith("[[")) {
		const closingIndex = stripped.indexOf("]]", 2);
		if (closingIndex < 0) return null;
		return stripped.slice(2, closingIndex).trim();
	}
	if (!stripped.startsWith("[")) return null;
	const closingIndex = stripped.indexOf("]");
	if (closingIndex < 0) return null;
	return stripped.slice(1, closingIndex).trim();
}
