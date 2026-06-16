import { describe, expect, test } from "vitest";

import { collectSchemaContractMismatches } from "../support/json-schema-contract.ts";

const baseObjectSchema = {
	type: "object",
	properties: {
		status: { enum: ["ok", "error"] },
		count: { type: "integer" },
	},
	required: ["status"],
};

describe("json schema contract comparator", () => {
	test("reports property set mismatches", () => {
		const mismatches = collectSchemaContractMismatches(
			baseObjectSchema,
			{
				type: "object",
				properties: {
					status: { enum: ["ok", "error"] },
					message: { type: "string" },
				},
				required: ["status"],
			},
		);

		expect(mismatches).toContain("#: property sets differ (missing: message; extra: count)");
	});

	test("reports required, enum, and nested type mismatches", () => {
		const mismatches = collectSchemaContractMismatches(
			{
				type: "object",
				properties: {
					status: { const: "ok" },
					items: { type: "array", items: { type: "string" } },
				},
				required: ["status", "items"],
			},
			{
				type: "object",
				properties: {
					status: { const: "error" },
					items: { type: "array", items: { type: "number" } },
				},
				required: ["status"],
			},
		);

		expect(mismatches).toEqual([
			"#: required sets differ (actual: items, status; expected: status)",
			"#.status: enum values differ (actual: ok; expected: error)",
			"#.items[]: branch kinds differ (actual: primitive:string; expected: primitive:number)",
		]);
	});
});
