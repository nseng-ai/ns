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
	let offset = 0;
	let isInTable = false;
	for (const line of source.split(/(?<=\n)/u)) {
		const trimmed = line.trimStart();
		if (trimmed !== "" && !trimmed.startsWith("#")) {
			if (trimmed.startsWith("[")) isInTable = true;
			if (!isInTable) {
				const match = /^extensions\s*=\s*\[/u.exec(trimmed);
				if (match !== null) {
					const assignmentStart = offset + line.length - trimmed.length;
					return { assignmentStart, openOffset: assignmentStart + match[0].lastIndexOf("[") };
				}
			}
		}
		offset += line.length;
	}
	return undefined;
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
			return index + 3;
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
