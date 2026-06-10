import { describe, expect, test } from "vitest";

import { z } from "zod";
import { extractJsonObjectText, parseLmJson } from "../src/context-profiler/lm-json.ts";

const valueSchema = z.object({ value: z.string() });

describe("extractJsonObjectText", () => {
	test("strips JSON fences", () => {
		expect(extractJsonObjectText("```json\n{\"value\":\"ok\"}\n```"))
			.toBe('{"value":"ok"}');
	});

	test("slices prose wrapped around an object", () => {
		expect(extractJsonObjectText("before {\"value\":\"ok\"} after"))
			.toBe('{"value":"ok"}');
	});

	test("uses the outer brace span", () => {
		expect(extractJsonObjectText("x {\"value\":\"{nested}\"} y"))
			.toBe('{"value":"{nested}"}');
	});
});

describe("parseLmJson", () => {
	test("returns parsed schema data", () => {
		expect(parseLmJson('{"value":"ok"}', valueSchema, { invalidShapeError: "bad shape" }))
			.toEqual({ ok: true, value: { value: "ok" } });
	});

	test("reports missing JSON object", () => {
		expect(parseLmJson("no object", valueSchema, { invalidShapeError: "bad shape" }))
			.toEqual({ ok: false, error: "response contains no JSON object" });
	});

	test("reports invalid JSON", () => {
		const result = parseLmJson("{nope}", valueSchema, { invalidShapeError: "bad shape" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/^invalid JSON: /);
	});

	test("reports invalid schema with caller-provided message", () => {
		expect(parseLmJson('{"value":1}', valueSchema, { invalidShapeError: "bad shape" }))
			.toEqual({ ok: false, error: "bad shape" });
	});
});
