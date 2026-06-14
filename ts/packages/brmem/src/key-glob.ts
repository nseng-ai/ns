import { validateKeyGlob } from "./validation.ts";

export function keyGlobMatches(key: string, pattern: string): boolean {
	const validation = validateKeyGlob(pattern);
	if (validation.type === "invalid") return false;
	return fnmatchCaseToRegExp(pattern).test(key);
}

export function fnmatchCaseToRegExp(pattern: string): RegExp {
	let source = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index];
		if (character === undefined) continue;
		if (character === "*") {
			source += ".*";
			continue;
		}
		if (character === "?") {
			source += ".";
			continue;
		}
		if (character === "[") {
			const classResult = readCharacterClass(pattern, index);
			if (classResult !== undefined) {
				source += classResult.source;
				index = classResult.endIndex;
				continue;
			}
		}
		source += escapeRegex(character);
	}
	source += "$";
	return new RegExp(source, "u");
}

interface CharacterClassRead {
	source: string;
	endIndex: number;
}

function readCharacterClass(pattern: string, startIndex: number): CharacterClassRead | undefined {
	let index = startIndex + 1;
	if (index >= pattern.length) return undefined;
	let negated = false;
	if (pattern[index] === "!" || pattern[index] === "^") {
		negated = true;
		index += 1;
	}
	let body = "";
	if (pattern[index] === "]") {
		body += "\\]";
		index += 1;
	}
	for (; index < pattern.length; index += 1) {
		const character = pattern[index];
		if (character === undefined) continue;
		if (character === "]") {
			if (body.length === 0) return undefined;
			return { source: `[${negated ? "^" : ""}${body}]`, endIndex: index };
		}
		body += escapeCharacterClass(character);
	}
	return undefined;
}

function escapeRegex(character: string): string {
	return /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character;
}

function escapeCharacterClass(character: string): string {
	if (character === "\\" || character === "]") return `\\${character}`;
	return character;
}
