import { parseDeclaredExtensionSpecsToml } from "./descriptor-package.ts";

export type NsTomlExtensionsAppendResult =
	| {
			readonly ok: true;
			readonly text: string;
			readonly isAdded: boolean;
	  }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions" | "unsupported-format";
			readonly message: string;
	  };

export function appendDeclaredExtensionSpecToml(
	source: string,
	spec: string,
): NsTomlExtensionsAppendResult {
	const parsed = parseDeclaredExtensionSpecsToml(source);
	if (!parsed.ok) {
		return { ok: false, reason: parsed.reason, message: parsed.message };
	}
	if (parsed.specs.includes(spec)) return { ok: true, text: source, isAdded: false };
	if (parsed.specs.length === 0 && !hasTopLevelExtensionsAssignment(source)) {
		const prefix = source.trimEnd();
		return {
			ok: true,
			text: `${prefix}${prefix === "" ? "" : "\n"}extensions = [${JSON.stringify(spec)}]\n`,
			isAdded: true,
		};
	}
	const replacement = appendToExistingExtensionsArray(source, spec);
	if (replacement === undefined) {
		return {
			ok: false,
			reason: "unsupported-format",
			message:
				"Top-level ns.toml extensions assignment must be a textual array before ns install can append to it.",
		};
	}
	return { ok: true, text: replacement, isAdded: true };
}

function hasTopLevelExtensionsAssignment(source: string): boolean {
	return findTopLevelExtensionsLine(source.split(/(?<=\n)/u)) !== undefined;
}

function appendToExistingExtensionsArray(source: string, spec: string): string | undefined {
	const lines = source.split(/(?<=\n)/u);
	const startIndex = findTopLevelExtensionsLine(lines);
	if (startIndex === undefined) return undefined;
	const startLine = lines[startIndex];
	if (startLine === undefined) return undefined;
	const equalsIndex = startLine.indexOf("=");
	const openIndex = startLine.indexOf("[", equalsIndex);
	if (equalsIndex === -1 || openIndex === -1) return undefined;
	let depth = 0;
	for (let index = startIndex; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === undefined) return undefined;
		const scanStart = index === startIndex ? openIndex : 0;
		for (let charIndex = scanStart; charIndex < line.length; charIndex += 1) {
			const char = line[charIndex];
			if (char === "[") depth += 1;
			if (char === "]") {
				depth -= 1;
				if (depth === 0) {
					return appendBeforeArrayClose({
						source,
						lines,
						startIndex,
						closeLineIndex: index,
						closeCharIndex: charIndex,
						spec,
					});
				}
			}
		}
	}
	return undefined;
}

function appendBeforeArrayClose(options: {
	readonly source: string;
	readonly lines: readonly string[];
	readonly startIndex: number;
	readonly closeLineIndex: number;
	readonly closeCharIndex: number;
	readonly spec: string;
}): string {
	const offsets = lineStartOffsets(options.lines);
	const closeOffset = (offsets[options.closeLineIndex] ?? 0) + options.closeCharIndex;
	const before = options.source.slice(0, closeOffset).trimEnd();
	const after = options.source.slice(closeOffset);
	const separator = before.endsWith("[") ? "" : ",";
	if (options.closeLineIndex !== options.startIndex) {
		const closeLine = options.lines[options.closeLineIndex] ?? "";
		const indent = closeLine.match(/^\s*/u)?.[0] ?? "";
		return `${before}${separator}\n${indent}\t${JSON.stringify(options.spec)}\n${after}`;
	}
	return `${before}${separator} ${JSON.stringify(options.spec)}${after}`;
}

function lineStartOffsets(lines: readonly string[]): readonly number[] {
	let offset = 0;
	const offsets: number[] = [];
	for (const line of lines) {
		offsets.push(offset);
		offset += line.length;
	}
	return offsets;
}

function findTopLevelExtensionsLine(lines: readonly string[]): number | undefined {
	let isInTable = false;
	for (let index = 0; index < lines.length; index += 1) {
		const rawLine = lines[index];
		if (rawLine === undefined) continue;
		const line = rawLine.trimStart();
		if (line === "" || line.startsWith("#")) continue;
		if (line.startsWith("[")) isInTable = true;
		if (!isInTable && /^extensions\s*=\s*\[/u.test(line)) return index;
	}
	return undefined;
}
