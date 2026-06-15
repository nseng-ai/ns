import { Buffer } from "node:buffer";

export type DiffChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface DiffFile {
	path: string;
	oldPath: string | null;
	changeKind: DiffChangeKind;
	rawText: string;
	isBinary: boolean;
	addedLines: number;
	removedLines: number;
	hunkCount: number;
	byteSize: number;
	estimatedTokens: number;
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/;
const ESCAPED_BYTES = new Map<string, number>([
	["a", 7],
	["b", 8],
	["t", 9],
	["n", 10],
	["v", 11],
	["f", 12],
	["r", 13],
	["\\", 92],
	['"', 34],
]);

export function estimateTokens(text: string): number {
	if (text === "") return 0;
	return Math.ceil([...text].length / 4);
}

export function parseUnifiedDiff(diffText: string): DiffFile[] {
	if (diffText.trim() === "") return [];
	return diffSegments(diffText).map(parseSegment);
}

function diffSegments(diffText: string): string[] {
	const lines = splitLinesPreserveTerminators(diffText);
	const segments: string[] = [];
	let currentLines: string[] = [];

	for (const line of lines) {
		if (line.startsWith("diff --git ") && currentLines.length > 0) {
			segments.push(currentLines.join(""));
			currentLines = [];
		}
		currentLines.push(line);
	}

	if (currentLines.length > 0) segments.push(currentLines.join(""));
	return segments;
}

function parseSegment(rawText: string): DiffFile {
	const lines = splitLinesPreserveTerminators(rawText).map(stripLineTerminator);
	let [oldPath, newPath] = pathsFromPatchHeaders(lines);
	if (oldPath === null && newPath === null) {
		[oldPath, newPath] = pathsFromDiffHeader(lines);
	}

	const changeKind = changeKindFromLines(lines);
	const renameFrom = metadataValue(lines, "rename from ");
	const renameTo = metadataValue(lines, "rename to ");
	const copyFrom = metadataValue(lines, "copy from ");
	const copyTo = metadataValue(lines, "copy to ");

	if (renameTo !== null) newPath = renameTo;
	if (renameFrom !== null) oldPath = renameFrom;
	if (copyTo !== null) newPath = copyTo;
	if (copyFrom !== null) oldPath = copyFrom;

	if (newPath === null) newPath = oldPath ?? "";
	if (changeKind !== "renamed" && changeKind !== "copied") oldPath = null;

	const isBinary = lines.some((line) => line.startsWith("Binary files ") && line.endsWith(" differ"));
	const metrics = hunkMetrics(lines, { isBinary });

	return {
		path: newPath,
		oldPath,
		changeKind,
		rawText,
		isBinary,
		addedLines: metrics.addedLines,
		removedLines: metrics.removedLines,
		hunkCount: metrics.hunkCount,
		byteSize: Buffer.byteLength(rawText, "utf8"),
		estimatedTokens: estimateTokens(rawText),
	};
}

function splitLinesPreserveTerminators(text: string): string[] {
	const lines: string[] = [];
	let start = 0;
	let index = 0;
	while (index < text.length) {
		const char = text.charAt(index);
		if (char === "\r" || char === "\n") {
			let end = index + 1;
			if (char === "\r" && text.charAt(end) === "\n") end += 1;
			lines.push(text.slice(start, end));
			start = end;
			index = end;
			continue;
		}
		index += 1;
	}
	if (start < text.length) lines.push(text.slice(start));
	return lines;
}

function stripLineTerminator(line: string): string {
	if (line.endsWith("\r\n")) return line.slice(0, -2);
	if (line.endsWith("\n") || line.endsWith("\r")) return line.slice(0, -1);
	return line;
}

function changeKindFromLines(lines: readonly string[]): DiffChangeKind {
	let hasRename = false;
	let hasCopy = false;
	for (const line of lines) {
		if (line.startsWith("new file mode ")) return "added";
		if (line.startsWith("deleted file mode ")) return "deleted";
		if (line.startsWith("rename from ") || line.startsWith("rename to ")) hasRename = true;
		if (line.startsWith("copy from ") || line.startsWith("copy to ")) hasCopy = true;
	}

	if (hasRename) return "renamed";
	if (hasCopy) return "copied";
	return "modified";
}

function pathsFromPatchHeaders(lines: readonly string[]): [string | null, string | null] {
	let oldPath: string | null = null;
	let newPath: string | null = null;
	for (const line of lines) {
		if (line.startsWith("--- ")) oldPath = normalizePrefixedPath(decodePathField(line.slice("--- ".length)));
		else if (line.startsWith("+++ ")) newPath = normalizePrefixedPath(decodePathField(line.slice("+++ ".length)));
		if (oldPath !== null && newPath !== null) break;
	}

	if (oldPath === "/dev/null") oldPath = null;
	if (newPath === "/dev/null") newPath = null;
	return [oldPath, newPath];
}

function pathsFromDiffHeader(lines: readonly string[]): [string | null, string | null] {
	const firstLine = lines[0];
	if (firstLine === undefined || !firstLine.startsWith("diff --git ")) return [null, null];

	const tokens = pathTokens(firstLine.slice("diff --git ".length));
	const oldToken = tokens[0];
	const newToken = tokens[1];
	if (oldToken === undefined || newToken === undefined) return [null, null];
	return [normalizePrefixedPath(oldToken), normalizePrefixedPath(newToken)];
}

function metadataValue(lines: readonly string[], prefix: string): string | null {
	for (const line of lines) {
		if (line.startsWith(prefix)) return normalizePrefixedPath(decodePathField(line.slice(prefix.length)));
	}
	return null;
}

interface HunkMetricsOptions {
	isBinary: boolean;
}

interface HunkMetrics {
	addedLines: number;
	removedLines: number;
	hunkCount: number;
}

function hunkMetrics(lines: readonly string[], options: HunkMetricsOptions): HunkMetrics {
	if (options.isBinary) return { addedLines: 0, removedLines: 0, hunkCount: 0 };

	let addedLines = 0;
	let removedLines = 0;
	let hunkCount = 0;
	let inHunk = false;

	for (const line of lines) {
		if (HUNK_HEADER_RE.exec(line) !== null) {
			hunkCount += 1;
			inHunk = true;
			continue;
		}
		if (!inHunk) continue;
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) addedLines += 1;
		else if (line.startsWith("-")) removedLines += 1;
	}

	return { addedLines, removedLines, hunkCount };
}

function normalizePrefixedPath(path: string | null): string | null {
	if (path === null || path === "/dev/null") return path;
	if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
	return path;
}

function decodePathField(value: string): string {
	const stripped = value.trim();
	if (stripped === "") return "";
	const tokens = pathTokens(stripped);
	const firstToken = tokens[0];
	if (firstToken !== undefined) return firstToken;
	return decodeGitQuotedPath(stripped);
}

function pathTokens(value: string): string[] {
	const tokens: string[] = [];
	let index = 0;
	while (index < value.length) {
		while (index < value.length && /\s/.test(value.charAt(index))) index += 1;
		if (index >= value.length) break;
		if (value.charAt(index) === '"') {
			const result = readQuotedToken(value, index);
			tokens.push(decodeGitQuotedPath(result.token));
			index = result.nextIndex;
			continue;
		}

		const start = index;
		while (index < value.length && !/\s/.test(value.charAt(index))) index += 1;
		tokens.push(value.slice(start, index));
	}
	return tokens;
}

interface QuotedTokenRead {
	token: string;
	nextIndex: number;
}

function readQuotedToken(value: string, start: number): QuotedTokenRead {
	let index = start + 1;
	let escaped = false;
	while (index < value.length) {
		const char = value.charAt(index);
		if (escaped) escaped = false;
		else if (char === "\\") escaped = true;
		else if (char === '"') return { token: value.slice(start, index + 1), nextIndex: index + 1 };
		index += 1;
	}
	return { token: value.slice(start), nextIndex: value.length };
}

function decodeGitQuotedPath(value: string): string {
	if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;

	const inner = value.slice(1, -1);
	const output: number[] = [];
	let index = 0;
	while (index < inner.length) {
		const char = inner.charAt(index);
		if (char !== "\\") {
			output.push(...Buffer.from(char, "utf8"));
			index += 1;
			continue;
		}

		if (index + 1 >= inner.length) {
			output.push("\\".charCodeAt(0));
			index += 1;
			continue;
		}

		const escaped = inner.charAt(index + 1);
		const simpleByte = ESCAPED_BYTES.get(escaped);
		if (simpleByte !== undefined) {
			output.push(simpleByte);
			index += 2;
			continue;
		}
		if (isOctalDigit(escaped)) {
			let end = index + 1;
			while (end < inner.length && end < index + 4 && isOctalDigit(inner.charAt(end))) end += 1;
			const octalValue = Number.parseInt(inner.slice(index + 1, end), 8);
			if (octalValue <= 255) output.push(octalValue);
			index = end;
			continue;
		}

		output.push(...Buffer.from(escaped, "utf8"));
		index += 2;
	}

	return Buffer.from(output).toString("utf8");
}

function isOctalDigit(value: string): boolean {
	return /^[0-7]$/.test(value);
}
