export type LmJsonParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type SafeParseResult<T> = { success: true; data: T } | { success: false };

export interface SafeParseSchema<T> {
	safeParse(input: unknown): SafeParseResult<T>;
}

export function parseLmJson<T>(
	text: string,
	schema: SafeParseSchema<T>,
	options: { invalidShapeError: string },
): LmJsonParseResult<T> {
	const jsonText = extractJsonObjectText(text);
	if (jsonText === null) return { ok: false, error: "response contains no JSON object" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		return { ok: false, error: `invalid JSON: ${errorMessage(error)}` };
	}
	const result = schema.safeParse(parsed);
	if (!result.success) return { ok: false, error: options.invalidShapeError };
	return { ok: true, value: result.data };
}

export function extractJsonObjectText(text: string): string | null {
	const candidate = normalizeLmJsonCandidate(text);
	if (candidate === null) return null;
	for (let index = 0; index < candidate.length; index += 1) {
		if (candidate[index] !== "{") continue;
		const objectText = scanJsonObjectAt(candidate, index);
		if (objectText !== null) return objectText;
	}
	return null;
}

function normalizeLmJsonCandidate(text: string): string | null {
	const trimmed = text.trim();
	const fenced = /^```([^\n`]*)\n?([\s\S]*?)\s*```$/i.exec(trimmed);
	if (fenced === null) return trimmed;
	const language = fenced[1]?.trim().toLowerCase() ?? "";
	if (language !== "" && language !== "json" && language !== "jsonc") return null;
	return fenced[2] ?? "";
}

function scanJsonObjectAt(text: string, start: number): string | null {
	const stack: string[] = [];
	let isInString = false;
	let isEscaped = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (char === undefined) return null;
		if (isInString) {
			if (isEscaped) {
				isEscaped = false;
				continue;
			}
			if (char === "\\") {
				isEscaped = true;
				continue;
			}
			if (char === '"') isInString = false;
			continue;
		}
		if (char === '"') {
			isInString = true;
			continue;
		}
		if (char === "{" || char === "[") {
			stack.push(char);
			continue;
		}
		if (char === "}" || char === "]") {
			const opener = stack.pop();
			if (opener === undefined || !isMatchingJsonDelimiter(opener, char)) return null;
			if (stack.length === 0) return text.slice(start, index + 1);
		}
	}
	return null;
}

function isMatchingJsonDelimiter(opener: string, closer: string): boolean {
	return (opener === "{" && closer === "}") || (opener === "[" && closer === "]");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
