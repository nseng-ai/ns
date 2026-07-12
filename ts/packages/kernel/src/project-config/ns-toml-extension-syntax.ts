import { parse } from "smol-toml";

export interface ExtensionArraySyntaxValue {
	readonly decoded: string;
	readonly tokenStart: number;
	readonly tokenEnd: number;
	readonly commaBefore: number | undefined;
	readonly commaAfter: number | undefined;
}

export interface ExtensionArraySyntax {
	readonly assignmentStart: number;
	readonly openOffset: number;
	readonly closeOffset: number;
	readonly values: readonly ExtensionArraySyntaxValue[];
	readonly hasTrailingComma: boolean;
}

type TopLevelStatement =
	| {
			readonly type: "bare-assignment";
			readonly key: string;
			readonly assignmentStart: number;
			readonly valueOffset: number;
	  }
	| { readonly type: "table-header"; readonly offset: number };

/** Finds the first table header while ignoring brackets inside top-level values. */
export function findFirstTopLevelTableOffset(source: string): number | undefined {
	const statements = scanTopLevelPreamble(source);
	if (statements === undefined) return undefined;
	return statements.find((statement) => statement.type === "table-header")?.offset;
}

/** Finds the bare, top-level extensions assignment and couples every decoded value to its token span. */
export function parseExtensionArraySyntax(source: string): ExtensionArraySyntax | undefined {
	const assignment = findAssignment(source);
	if (assignment === undefined) return undefined;
	const values: ExtensionArraySyntaxValue[] = [];
	let commaBefore: number | undefined;
	let hasTrailingComma = false;
	let index = assignment.openOffset + 1;
	while (index < source.length) {
		index = skipTrivia(source, index);
		const char = source[index];
		if (char === "]") {
			return {
				assignmentStart: assignment.assignmentStart,
				openOffset: assignment.openOffset,
				closeOffset: index,
				values,
				hasTrailingComma,
			};
		}
		if (char !== '"' && char !== "'") return undefined;
		const tokenEnd = scanStringToken(source, index, char);
		if (tokenEnd === undefined) return undefined;
		const decoded = decodeStringToken(source.slice(index, tokenEnd));
		if (decoded === undefined) return undefined;
		const valueIndex = values.length;
		values.push({
			decoded,
			tokenStart: index,
			tokenEnd,
			commaBefore,
			commaAfter: undefined,
		});
		index = skipTrivia(source, tokenEnd);
		if (source[index] === ",") {
			const value = values[valueIndex];
			if (value === undefined) throw new Error("Expected scanned extension value.");
			values[valueIndex] = { ...value, commaAfter: index };
			commaBefore = index;
			hasTrailingComma = true;
			index += 1;
			continue;
		}
		hasTrailingComma = false;
		if (source[index] !== "]") return undefined;
	}
	return undefined;
}

function findAssignment(
	source: string,
): { assignmentStart: number; openOffset: number } | undefined {
	const statements = scanTopLevelPreamble(source);
	if (statements === undefined) return undefined;
	const assignment = statements.find(
		(statement) =>
			statement.type === "bare-assignment" &&
			statement.key === "extensions" &&
			source[statement.valueOffset] === "[",
	);
	if (assignment?.type !== "bare-assignment") return undefined;
	return { assignmentStart: assignment.assignmentStart, openOffset: assignment.valueOffset };
}

function scanTopLevelPreamble(source: string): readonly TopLevelStatement[] | undefined {
	const statements: TopLevelStatement[] = [];
	let index = 0;
	let lineOffset = 0;
	let isLinePrefix = true;
	let arrayDepth = 0;
	let inlineTableDepth = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === "\n") {
			index += 1;
			lineOffset = index;
			isLinePrefix = true;
			continue;
		}
		if (isLinePrefix && (char === " " || char === "\t" || char === "\r")) {
			index += 1;
			continue;
		}
		if (char === "#") {
			const newline = source.indexOf("\n", index + 1);
			if (newline === -1) return statements;
			index = newline;
			continue;
		}
		if (char === '"' || char === "'") {
			const tokenEnd = scanStringToken(source, index, char);
			if (tokenEnd === undefined) return undefined;
			const lastNewline = source.lastIndexOf("\n", tokenEnd - 1);
			if (lastNewline >= index) {
				lineOffset = lastNewline + 1;
				isLinePrefix = false;
			}
			index = tokenEnd;
			continue;
		}
		if (isLinePrefix && arrayDepth === 0 && inlineTableDepth === 0) {
			if (char === "[") {
				statements.push({ type: "table-header", offset: lineOffset });
				return statements;
			}
			const assignment = scanBareAssignment(source, index);
			if (assignment !== undefined) statements.push(assignment);
		}
		isLinePrefix = false;
		if (char === "[") arrayDepth += 1;
		if (char === "]") arrayDepth -= 1;
		if (char === "{") inlineTableDepth += 1;
		if (char === "}") inlineTableDepth -= 1;
		index += 1;
	}
	return statements;
}

function scanBareAssignment(
	source: string,
	assignmentStart: number,
): Extract<TopLevelStatement, { type: "bare-assignment" }> | undefined {
	let index = assignmentStart;
	while (isBareKeyCharacter(source[index])) index += 1;
	if (index === assignmentStart) return undefined;
	const key = source.slice(assignmentStart, index);
	while (source[index] === " " || source[index] === "\t") index += 1;
	if (source[index] !== "=") return undefined;
	index += 1;
	while (source[index] === " " || source[index] === "\t") index += 1;
	return { type: "bare-assignment", key, assignmentStart, valueOffset: index };
}

function isBareKeyCharacter(char: string | undefined): boolean {
	return char !== undefined && /[A-Za-z0-9_-]/u.test(char);
}

function skipTrivia(source: string, start: number): number {
	let index = start;
	while (index < source.length) {
		const char = source[index];
		if (char === "#") {
			const newline = source.indexOf("\n", index + 1);
			return newline === -1 ? source.length : skipTrivia(source, newline + 1);
		}
		if (char === " " || char === "\t" || char === "\r" || char === "\n") {
			index += 1;
			continue;
		}
		return index;
	}
	return index;
}

function scanStringToken(source: string, start: number, quote: '"' | "'"): number | undefined {
	const isMultiline = source.slice(start, start + 3) === quote.repeat(3);
	const delimiterLength = isMultiline ? 3 : 1;
	let index = start + delimiterLength;
	let isEscaped = false;
	while (index < source.length) {
		if (isMultiline && source.slice(index, index + 3) === quote.repeat(3) && !isEscaped) {
			let tokenEnd = index + 3;
			while (source[tokenEnd] === quote) tokenEnd += 1;
			return tokenEnd;
		}
		const char = source[index];
		if (!isMultiline && char === quote && !isEscaped) return index + 1;
		if (!isMultiline && (char === "\n" || char === "\r")) return undefined;
		if (quote === '"' && char === "\\" && !isEscaped) {
			isEscaped = true;
			index += 1;
			continue;
		}
		isEscaped = false;
		index += 1;
	}
	return undefined;
}

function decodeStringToken(token: string): string | undefined {
	try {
		const value = parse(`value = ${token}`).value;
		return typeof value === "string" ? value : undefined;
	} catch {
		// A token that fails to parse as TOML is simply not a decodable string
		// literal; callers treat undefined as "no match" and fall back safely.
		return undefined;
	}
}
