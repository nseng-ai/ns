import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	nsClinkrCommand,
	nsClinkrCommandOptionsForRun,
	createCatalogView,
	createUnavailableInteraction,
	defineCommand,
	isNsClinkrCommandRun,
	isComposableCommand,
} from "../../src/command/index.ts";
import { validateDescriptorCommandContribution } from "../../src/extensions/command-registry.ts";
import { ok } from "../../src/sdk/result.ts";

describe("composable command API", () => {
	test("brands nsClinkrCommand runs directly and recovers their specification", () => {
		const run = nsClinkrCommand({
			schema: z.object({ value: z.string() }),
			resultSchema: z.string(),
			handler: (_bundle, request) => ok(request.value),
		});
		const command = defineCommand({ name: "probe", summary: "Probe.", run });

		expect(isComposableCommand(command)).toBe(true);
		expect(isNsClinkrCommandRun(run)).toBe(true);
		expect(nsClinkrCommandOptionsForRun(run).schema).toBeInstanceOf(z.ZodObject);
		expect(nsClinkrCommandOptionsForRun(run).handler).toBe(run);
	});

	test("defaults omitted input schemas to a strict empty object", () => {
		const run = nsClinkrCommand({
			resultSchema: z.string(),
			handler: () => ok("done"),
		});
		const schema = nsClinkrCommandOptionsForRun(run).schema;

		expect(schema.safeParse({})).toMatchObject({ success: true });
		expect(schema.safeParse({ unexpected: true })).toMatchObject({ success: false });
	});

	test("descriptor validation accepts nsClinkrCommand and rejects arbitrary composable callables", () => {
		const nsClinkrCommandDefinition = defineCommand({
			name: "probe",
			summary: "Probe.",
			run: nsClinkrCommand({
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
			validateDescriptorCommandContribution(
				nsClinkrCommandDefinition,
				{ name: "probe" },
				"fixture",
			),
		).toMatchObject({ ok: true });
		expect(
			validateDescriptorCommandContribution(arbitraryCommand, { name: "probe" }, "fixture"),
		).toEqual({
			ok: false,
			message:
				"Invalid ns descriptor command fixture: composable command run must carry nsClinkrCommand metadata.",
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
