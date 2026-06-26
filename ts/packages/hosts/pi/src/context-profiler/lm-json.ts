import { errorMessage } from "./errors.ts";

export type LmJsonParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

type SafeParseResult<T> = { success: true; data: T } | { success: false };

interface SafeParseSchema<T> {
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
	const trimmed = text.trim();
	const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	const candidate = fenced?.[1] ?? trimmed;
	const first = candidate.indexOf("{");
	const last = candidate.lastIndexOf("}");
	if (first === -1 || last <= first) return null;
	return candidate.slice(first, last + 1);
}
