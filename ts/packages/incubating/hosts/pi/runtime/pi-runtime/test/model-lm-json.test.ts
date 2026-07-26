import { describe, expect, test } from "vitest";

import { z } from "zod";
import { extractJsonObjectText, parseLmJson } from "../src/kit/models/lm-json.ts";

const valueSchema = z.object({ value: z.string() });

describe("extractJsonObjectText", () => {
	test("strips supported JSON fences", () => {
		expect(extractJsonObjectText('```json\n{"value":"ok"}\n```')).toBe('{"value":"ok"}');
		expect(extractJsonObjectText('```JSON\n{"value":"ok"}\n```')).toBe('{"value":"ok"}');
		expect(extractJsonObjectText('```jsonc\n{"value":"ok"}\n```')).toBe('{"value":"ok"}');
		expect(extractJsonObjectText('```\n{"value":"ok"}\n```')).toBe('{"value":"ok"}');
	});

	test("rejects unsupported full-response fence languages", () => {
		expect(extractJsonObjectText('```ts\n{"value":"ok"}\n```')).toBeNull();
	});

	test("slices prose wrapped around an object", () => {
		expect(extractJsonObjectText('before {"value":"ok"} after')).toBe('{"value":"ok"}');
	});

	test("ignores braces inside strings", () => {
		expect(extractJsonObjectText('x {"value":"{nested}"} y')).toBe('{"value":"{nested}"}');
	});

	test("handles escaped quotes and escaped backslashes inside strings", () => {
		const text = 'before {"value":"quote: \\\" and slash: \\\\"} after';
		expect(extractJsonObjectText(text)).toBe('{"value":"quote: \\\" and slash: \\\\"}');
	});

	test("returns the first complete object when multiple objects appear", () => {
		expect(extractJsonObjectText('first {"value":"one"} second {"value":"two"}')).toBe(
			'{"value":"one"}',
		);
	});

	test("returns null for malformed or incomplete objects", () => {
		expect(extractJsonObjectText('before {"value":"ok"')).toBeNull();
		expect(extractJsonObjectText('before {"value": [1} after')).toBeNull();
	});
});

describe("parseLmJson", () => {
	test("returns parsed schema data", () => {
		expect(parseLmJson('{"value":"ok"}', valueSchema, { invalidShapeError: "bad shape" })).toEqual({
			ok: true,
			value: { value: "ok" },
		});
	});

	test("reports missing JSON object", () => {
		expect(parseLmJson("no object", valueSchema, { invalidShapeError: "bad shape" })).toEqual({
			ok: false,
			error: "response contains no JSON object",
		});
	});

	test("reports invalid JSON", () => {
		const result = parseLmJson("{nope}", valueSchema, { invalidShapeError: "bad shape" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/^invalid JSON: /);
	});

	test("reports invalid schema with caller-provided message", () => {
		expect(parseLmJson('{"value":1}', valueSchema, { invalidShapeError: "bad shape" })).toEqual({
			ok: false,
			error: "bad shape",
		});
	});
});
