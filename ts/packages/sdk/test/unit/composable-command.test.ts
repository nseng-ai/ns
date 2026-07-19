import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	clinkr,
	clinkrSpecForRun,
	createCatalogView,
	createUnavailableInteraction,
	defineCommand,
	isClinkrRun,
	isComposableCommand,
	isHostableRun,
} from "../../src/command/index.ts";
import { ok } from "../../src/sdk/result.ts";

describe("composable command API", () => {
	test("exports plain composable names beside the unchanged legacy definer", () => {
		const run = clinkr<object, z.ZodObject<{ value: z.ZodString }>, string>({
			schema: z.object({ value: z.string() }),
			resultSchema: z.string(),
			handler: (_bundle, request) => ok(request.value),
		});
		const command = defineCommand({ name: "probe", summary: "Probe.", run });

		expect(isComposableCommand(command)).toBe(true);
		expect(isHostableRun(run)).toBe(true);
		expect(isClinkrRun(run)).toBe(true);
		expect(clinkrSpecForRun(run).schema).toBeInstanceOf(z.ZodObject);
	});

	test("projects a read-only effective extension view", () => {
		const catalog = createCatalogView(new Set(["@example/one"]));
		expect(catalog.has("@example/one")).toBe(true);
		expect(catalog.has("@example/two")).toBe(false);
	});

	test("non-interactive interactions fail explicitly instead of hanging", async () => {
		const interact = createUnavailableInteraction();
		expect(await interact.confirm({ message: "Continue?" })).toEqual({ type: "unavailable" });
		expect(
			await interact.select({ message: "Pick", choices: [{ value: "one", label: "One" }] }),
		).toEqual({ type: "unavailable" });
	});
});
