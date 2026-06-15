export interface ReviewApplicability {
	readonly include: readonly string[];
	readonly exclude: readonly string[];
}

export interface ReviewDefinitionWithApplicability {
	readonly applicability: ReviewApplicability;
}

export function applicableReviewKeys(
	definitionsByKey: ReadonlyMap<string, ReviewDefinitionWithApplicability> | Readonly<Record<string, ReviewDefinitionWithApplicability>>,
	options: { readonly changedPaths: readonly string[] },
): string[] {
	const entries = definitionsByKey instanceof Map ? definitionsByKey.entries() : Object.entries(definitionsByKey);
	const keys: string[] = [];
	for (const [key, definition] of entries) {
		if (reviewAppliesToPaths(definition.applicability, options.changedPaths)) keys.push(key);
	}
	return keys;
}

export function reviewAppliesToPaths(applicability: ReviewApplicability, changedPaths: readonly string[]): boolean {
	if (applicability.include.length === 0) return true;
	return changedPaths.some((path) => pathContributes(path, applicability));
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
	const pathSegments = splitPath(path);
	const patternSegments = splitPath(pattern);
	if (pathSegments === null || patternSegments === null) return false;
	return segmentsMatch(pathSegments, patternSegments);
}

function pathContributes(path: string, applicability: ReviewApplicability): boolean {
	const isIncluded = applicability.include.some((pattern) => pathMatchesPattern(path, pattern));
	if (!isIncluded) return false;
	return !applicability.exclude.some((pattern) => pathMatchesPattern(path, pattern));
}

function splitPath(path: string): readonly string[] | null {
	let normalized = path.replaceAll("\\", "/").trim();
	if (normalized === "" || normalized.startsWith("/")) return null;
	if (normalized.startsWith("./")) normalized = normalized.slice(2);
	const segments = normalized.split("/").filter((segment) => segment !== "");
	if (segments.length === 0 || segments.includes("..")) return null;
	return segments;
}

function segmentsMatch(pathSegments: readonly string[], patternSegments: readonly string[]): boolean {
	if (patternSegments.length === 0) return pathSegments.length === 0;

	const patternHead = patternSegments[0];
	const patternTail = patternSegments.slice(1);
	if (patternHead === "**") {
		if (segmentsMatch(pathSegments, patternTail)) return true;
		return pathSegments.length > 0 && segmentsMatch(pathSegments.slice(1), patternSegments);
	}

	const pathHead = pathSegments[0];
	if (pathHead === undefined || patternHead === undefined) return false;
	return segmentMatches(pathHead, patternHead) && segmentsMatch(pathSegments.slice(1), patternTail);
}

function segmentMatches(pathSegment: string, patternSegment: string): boolean {
	return segmentPatternToRegExp(patternSegment).test(pathSegment);
}

function segmentPatternToRegExp(patternSegment: string): RegExp {
	let pattern = "^";
	let index = 0;
	while (index < patternSegment.length) {
		const char = patternSegment.charAt(index);
		if (char === "*") {
			pattern += "[^/]*";
			index += 1;
			continue;
		}
		if (char === "?") {
			pattern += "[^/]";
			index += 1;
			continue;
		}
		if (char === "[") {
			const classRead = readCharacterClass(patternSegment, index);
			pattern += classRead.regexSource;
			index = classRead.nextIndex;
			continue;
		}
		pattern += escapeRegExp(char);
		index += 1;
	}
	return new RegExp(`${pattern}$`, "u");
}

interface CharacterClassRead {
	readonly regexSource: string;
	readonly nextIndex: number;
}

function readCharacterClass(patternSegment: string, startIndex: number): CharacterClassRead {
	let index = startIndex + 1;
	let isNegated = false;
	if (patternSegment.charAt(index) === "!") {
		isNegated = true;
		index += 1;
	}

	let classSource = "";
	if (patternSegment.charAt(index) === "]") {
		classSource += "\\]";
		index += 1;
	}

	for (; index < patternSegment.length; index += 1) {
		const char = patternSegment.charAt(index);
		if (char === "]") {
			if (classSource === "") return { regexSource: escapeRegExp("["), nextIndex: startIndex + 1 };
			return { regexSource: `[${isNegated ? "^" : ""}${classSource}]`, nextIndex: index + 1 };
		}
		classSource += escapeCharacterClassChar(char);
	}

	return { regexSource: escapeRegExp("["), nextIndex: startIndex + 1 };
}

function escapeRegExp(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function escapeCharacterClassChar(value: string): string {
	if (value === "\\" || value === "^" || value === "]") return `\\${value}`;
	return value;
}
