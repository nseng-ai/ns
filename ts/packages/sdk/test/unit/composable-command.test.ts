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
} from "../../src/command/index.ts";
import { validateDescriptorCommandContribution } from "../../src/extensions/command-registry.ts";
import { ok } from "../../src/sdk/result.ts";

describe("composable command API", () => {
	test("brands clinkr runs directly and recovers their specification", () => {
		const run = clinkr<z.ZodObject<{ value: z.ZodString }>, string>({
			schema: z.object({ value: z.string() }),
			resultSchema: z.string(),
			handler: (_bundle, request) => ok(request.value),
		});
		const command = defineCommand({ name: "probe", summary: "Probe.", run });

		expect(isComposableCommand(command)).toBe(true);
		expect(isClinkrRun(run)).toBe(true);
		expect(clinkrSpecForRun(run).schema).toBeInstanceOf(z.ZodObject);
		expect(clinkrSpecForRun(run).handler).toBe(run);
	});

	test("descriptor validation accepts clinkr and rejects arbitrary composable callables", () => {
		const clinkrCommand = defineCommand({
			name: "probe",
			summary: "Probe.",
			run: clinkr({
				schema: z.object({}),
				resultSchema: z.string(),
				handler: () => ok("done"),
			}),
		});
		const arbitraryCommand = defineCommand({
			name: "probe",
			summary: "Probe.",
			run: () => ok("done"),
		});

		expect(
			validateDescriptorCommandContribution(clinkrCommand, { name: "probe" }, "fixture"),
		).toMatchObject({ ok: true });
		expect(
			validateDescriptorCommandContribution(arbitraryCommand, { name: "probe" }, "fixture"),
		).toEqual({
			ok: false,
			message:
				"Invalid ns descriptor command fixture: composable command run must carry clinkr metadata.",
		});
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
