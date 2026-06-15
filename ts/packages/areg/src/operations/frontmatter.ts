const FRONTMATTER_KEY_RE = /^(?<key>[A-Za-z0-9_-]+):(?<value>.*)$/u;

export interface SkillFrontmatterData {
	fields: Readonly<Record<string, string>>;
	keys: ReadonlySet<string>;
}

export type SkillFrontmatterParseResult = { type: "ok"; value: SkillFrontmatterData } | { type: "error"; message: string };

export function parseSkillFrontmatterBlock(text: string): SkillFrontmatterParseResult {
	const lines = text.split(/\r?\n/u);
	if (lines.at(-1) === "") lines.pop();
	if (lines.length === 0 || lines[0] !== "---") return { type: "error", message: "missing opening frontmatter delimiter '---'" };
	const endIndex = lines.indexOf("---", 1);
	if (endIndex === -1) return { type: "error", message: "missing closing frontmatter delimiter '---'" };
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
	for (const line of lines.slice(1, endIndex)) {
		const stripped = line.trim();
		if (stripped.length === 0) continue;
		if (stripped.startsWith("#")) continue;
		if (!line.startsWith(" ") && !line.startsWith("\t")) {
			flushCurrent();
			const match = FRONTMATTER_KEY_RE.exec(line);
			if (match?.groups === undefined) return { type: "error", message: `invalid frontmatter line: ${JSON.stringify(line)}` };
			currentKey = match.groups.key ?? "";
			keys.add(currentKey);
			currentValues = [];
			const inlineValue = (match.groups.value ?? "").trim();
			if (inlineValue.length > 0) currentValues.push(inlineValue);
			continue;
		}
		if (currentKey === undefined) return { type: "error", message: `invalid frontmatter line: ${JSON.stringify(line)}` };
		currentValues.push(line.trim());
	}
	flushCurrent();
	return { type: "ok", value: { fields, keys } };
}
