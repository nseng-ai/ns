import { splitMarkdownFrontmatter, stripLineEnding } from "@asdl/core/markdown-frontmatter";

const FRONTMATTER_KEY_RE = /^(?<key>[A-Za-z0-9_-]+):(?<value>.*)$/u;

export interface SkillFrontmatterData {
	fields: Readonly<Record<string, string>>;
	keys: ReadonlySet<string>;
}

export type SkillFrontmatterParseResult = { type: "ok"; value: SkillFrontmatterData } | { type: "error"; message: string };

export type SkillFrontmatterTopLevelLineParseResult =
	| { type: "key"; key: string; value: string }
	| { type: "not_top_level" }
	| { type: "invalid"; line: string };

export function parseSkillFrontmatterBlock(text: string): SkillFrontmatterParseResult {
	const split = splitMarkdownFrontmatter(text);
	if (split.type === "not_found") return { type: "error", message: "missing opening frontmatter delimiter '---'" };
	if (split.type === "missing_closing_fence") return { type: "error", message: "missing closing frontmatter delimiter '---'" };

	const lines = split.block.frontmatterLinesWithEndings.map(stripLineEnding);
	const fields: Record<string, string> = {};
	const keys = new Set<string>();
	let currentKey: string | undefined;
	let currentValues: string[] = [];
	function flushCurrent(): void {
		if (currentKey === undefined) return;
		let rawValue = currentValues.filter((value) => value.length > 0).join(" ").trim();
		if (rawValue.length >= 2 && rawValue[0] === rawValue.at(-1) && (rawValue[0] === "\"" || rawValue[0] === "'")) rawValue = rawValue.slice(1, -1);
		fields[currentKey] = rawValue;
	}
	for (const line of lines) {
		const stripped = line.trim();
		if (stripped.length === 0) continue;
		if (stripped.startsWith("#")) continue;
		const parsedLine = parseSkillFrontmatterTopLevelLine(line);
		if (parsedLine.type === "key") {
			flushCurrent();
			if (keys.has(parsedLine.key)) return { type: "error", message: `duplicate frontmatter key: ${JSON.stringify(parsedLine.key)}` };
			currentKey = parsedLine.key;
			keys.add(currentKey);
			currentValues = [];
			const inlineValue = parsedLine.value.trim();
			if (inlineValue.length > 0) currentValues.push(inlineValue);
			continue;
		}
		if (parsedLine.type === "invalid") return { type: "error", message: `invalid frontmatter line: ${JSON.stringify(parsedLine.line)}` };
		if (currentKey === undefined) return { type: "error", message: `invalid frontmatter line: ${JSON.stringify(line)}` };
		currentValues.push(line.trim());
	}
	flushCurrent();
	return { type: "ok", value: { fields, keys } };
}

export function parseSkillFrontmatterTopLevelLine(line: string): SkillFrontmatterTopLevelLineParseResult {
	const content = stripLineEnding(line);
	if (content.trim().length === 0) return { type: "not_top_level" };
	if (content.trim().startsWith("#")) return { type: "not_top_level" };
	if (content.startsWith(" ") || content.startsWith("\t")) return { type: "not_top_level" };
	const match = FRONTMATTER_KEY_RE.exec(content);
	if (match?.groups === undefined) return { type: "invalid", line: content };
	return { type: "key", key: match.groups.key ?? "", value: match.groups.value ?? "" };
}

export function isSkillFrontmatterTopLevelKey(line: string, key: string): boolean {
	const parsed = parseSkillFrontmatterTopLevelLine(line);
	return parsed.type === "key" && parsed.key === key;
}

export function transformSkillFrontmatter(text: string, pathLabel: string, desired: Readonly<Record<string, string | undefined>>): { type: "ok"; value: string } | { type: "error"; message: string } {
	const parsed = parseSkillFrontmatterBlock(text);
	if (parsed.type === "error") return { type: "error", message: `${pathLabel} ${parsed.message}` };

	const split = splitMarkdownFrontmatter(text);
	if (split.type !== "found") return { type: "error", message: `${pathLabel} invalid frontmatter bounds` };

	const lines = [...split.block.linesWithEndings];
	const nameIndex = lines.findIndex((line, index) => index > 0 && index < split.block.closingIndex && isSkillFrontmatterTopLevelKey(line, "name"));
	if (nameIndex === -1) return { type: "error", message: `${pathLabel} missing name field in frontmatter` };

	const managedKeys = Object.keys(desired);
	const kept = lines.filter((line, index) => index <= 0 || index >= split.block.closingIndex || !managedKeys.some((key) => isSkillFrontmatterTopLevelKey(line, key)));
	const keptNameIndex = kept.findIndex((line, index) => index > 0 && isSkillFrontmatterTopLevelKey(line, "name"));
	const additions = managedKeys.flatMap((key) => {
		const value = desired[key];
		return value === undefined ? [] : [`${key}: ${value}${split.block.lineEnding}`];
	});
	kept.splice(keptNameIndex + 1, 0, ...additions);
	return { type: "ok", value: kept.join("") };
}
