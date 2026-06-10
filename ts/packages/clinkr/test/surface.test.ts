import { z } from "zod";
import { describe, expect, test } from "vitest";

import { buildSurfacePlan } from "../src/surface.ts";

describe("buildSurfacePlan kinds", () => {
	test("detects the v1 type vocabulary", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({
				name: z.string(),
				count: z.number(),
				ratio: z.int(),
				dry_run: z.boolean(),
				mode: z.enum(["fast", "slow"]),
				tags: z.array(z.string()),
			}),
		);
		const kinds = Object.fromEntries(plan.options.map((option) => [option.key, option.kind]));
		expect(kinds).toEqual({
			name: { type: "string" },
			count: { type: "number" },
			ratio: { type: "number" },
			dry_run: { type: "boolean" },
			mode: { type: "enum", values: ["fast", "slow"] },
			tags: { type: "string-array" },
		});
	});

	test("unwraps optional and default wrappers", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({
				slug: z.string().optional(),
				limit: z.number().default(10),
			}),
		);
		const byKey = Object.fromEntries(plan.options.map((option) => [option.key, option]));
		expect(byKey["slug"]).toMatchObject({ required: false, hasDefault: false });
		expect(byKey["limit"]).toMatchObject({
			required: false,
			hasDefault: true,
			defaultValue: 10,
			kind: { type: "number" },
		});
	});
});

describe("buildSurfacePlan flags", () => {
	test("maps snake_case keys to kebab-case flags with reverse attribute names", () => {
		const plan = buildSurfacePlan("probe", z.object({ plan_store_root: z.string() }));
		expect(plan.options[0]).toMatchObject({
			key: "plan_store_root",
			flag: "--plan-store-root <value>",
			attributeName: "planStoreRoot",
		});
	});

	test("required iff non-optional with no default", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({
				needed: z.string(),
				maybe: z.string().optional(),
				defaulted: z.string().default("x"),
			}),
		);
		const requiredByKey = Object.fromEntries(
			plan.options.map((option) => [option.key, option.required]),
		);
		expect(requiredByKey).toEqual({ needed: true, maybe: false, defaulted: false });
	});

	test("boolean becomes a bare flag", () => {
		const plan = buildSurfacePlan("probe", z.object({ dry_run: z.boolean().default(false) }));
		expect(plan.options[0]).toMatchObject({ flag: "--dry-run", attributeName: "dryRun" });
	});

	test("default-true boolean becomes a negation flag", () => {
		const plan = buildSurfacePlan("probe", z.object({ verbose: z.boolean().default(true) }));
		expect(plan.options[0]).toMatchObject({ flag: "--no-verbose", attributeName: "verbose" });
	});
});

describe("buildSurfacePlan descriptions", () => {
	test("describe() single-sources help text", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({ name: z.string().describe("the plan name") }),
		);
		expect(plan.options[0]?.description).toBe("the plan name");
	});

	test("describe() is found through wrappers", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({
				outer: z.string().default("x").describe("described after default"),
				inner: z.string().describe("described before optional").optional(),
			}),
		);
		const byKey = Object.fromEntries(
			plan.options.map((option) => [option.key, option.description]),
		);
		expect(byKey["outer"]).toBe('described after default (default: "x")');
		expect(byKey["inner"]).toBe("described before optional");
	});

	test("defaults are surfaced in the description", () => {
		const plan = buildSurfacePlan("probe", z.object({ limit: z.number().default(10) }));
		expect(plan.options[0]?.description).toBe("(default: 10)");
	});
});

describe("buildSurfacePlan positionals", () => {
	test("positionals are opt-in and ordered by position", () => {
		const plan = buildSurfacePlan(
			"probe",
			z.object({ target: z.string(), source: z.string(), flagged: z.boolean().default(false) }),
			{ source: { position: 0 }, target: { position: 1 } },
		);
		expect(plan.positionals.map((positional) => positional.key)).toEqual(["source", "target"]);
		expect(plan.options.map((option) => option.key)).toEqual(["flagged"]);
	});

	test("rejects unknown positional keys", () => {
		expect(() => buildSurfacePlan("probe", z.object({ a: z.string() }), { b: { position: 0 } })).toThrow(
			/unknown field 'b'/,
		);
	});

	test("rejects boolean and array positionals", () => {
		expect(() =>
			buildSurfacePlan("probe", z.object({ flag: z.boolean() }), { flag: { position: 0 } }),
		).toThrow(/cannot be a positional \(boolean\)/);
		expect(() =>
			buildSurfacePlan("probe", z.object({ tags: z.array(z.string()) }), {
				tags: { position: 0 },
			}),
		).toThrow(/cannot be a positional \(string-array\)/);
	});

	test("rejects non-contiguous or duplicate positions", () => {
		expect(() =>
			buildSurfacePlan("probe", z.object({ a: z.string(), b: z.string() }), {
				a: { position: 0 },
				b: { position: 2 },
			}),
		).toThrow(/unique and contiguous/);
		expect(() =>
			buildSurfacePlan("probe", z.object({ a: z.string(), b: z.string() }), {
				a: { position: 1 },
				b: { position: 1 },
			}),
		).toThrow(/unique and contiguous/);
	});
});

describe("buildSurfacePlan registration errors", () => {
	test("rejects schema types outside the v1 vocabulary", () => {
		expect(() => buildSurfacePlan("probe", z.object({ when: z.date() }))).toThrow(
			/unsupported schema type 'date' for field 'when' in command 'probe'/,
		);
		expect(() => buildSurfacePlan("probe", z.object({ nested: z.object({}) }))).toThrow(
			/unsupported schema type 'object'/,
		);
		expect(() => buildSurfacePlan("probe", z.object({ maybe: z.string().nullable() }))).toThrow(
			/unsupported schema type 'nullable'/,
		);
	});

	test("rejects non-string arrays", () => {
		expect(() => buildSurfacePlan("probe", z.object({ counts: z.array(z.number()) }))).toThrow(
			/array field 'counts' in command 'probe' must have string elements/,
		);
	});

	test("rejects reserved framework keys", () => {
		expect(() => buildSurfacePlan("probe", z.object({ format: z.string() }))).toThrow(
			/collides with a clinkr framework option/,
		);
		expect(() => buildSurfacePlan("probe", z.object({ json_schema: z.boolean() }))).toThrow(
			/collides with a clinkr framework option/,
		);
	});
});
