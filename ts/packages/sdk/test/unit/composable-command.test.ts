import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	createCatalogView,
	createUnavailableInteraction,
	defineCommand,
} from "../../src/command/index.ts";
import { validateDescriptorCommandContribution } from "../../src/extensions/command-registry.ts";
import { defineRawCommand } from "../../src/sdk/command.ts";
import { ok } from "../../src/command/result.ts";

describe("ns command definition API", () => {
	test("returns a flat definition and defaults description to summary", () => {
		const command = defineCommand({
			name: "probe",
			summary: "Probe.",
			resultSchema: z.string(),
			handler: () => ok("done"),
		});

		expect(command).toMatchObject({
			name: "probe",
			summary: "Probe.",
			description: "Probe.",
			resultSchema: expect.any(z.ZodType),
			handler: expect.any(Function),
		});
		expect("run" in command).toBe(false);
	});

	test("descriptor validation preserves the declared ns-command kind", () => {
		const command = defineCommand({
			name: "probe",
			summary: "Probe.",
			resultSchema: z.string(),
			handler: () => ok("done"),
		});
		const validation = validateDescriptorCommandContribution(
			command,
			{ kind: "ns-command", name: "probe", load: () => ({ default: command }) },
			"fixture",
		);

		expect(validation).toEqual({ ok: true, loaded: { kind: "ns-command", command } });
	});

	test("rejects a runtime command whose shape does not match the declared kind", () => {
		const rawCommand = defineRawCommand({
			name: "probe",
			summary: "Probe.",
			description: "Probe.",
			run: () => ok("done"),
		});
		const nsCommand = defineCommand({
			name: "probe",
			summary: "Probe.",
			resultSchema: z.string(),
			handler: () => ok("done"),
		});

		expect(
			validateDescriptorCommandContribution(
				rawCommand,
				{ kind: "ns-command", name: "probe", load: () => ({ default: nsCommand }) },
				"fixture",
			),
		).toEqual({
			ok: false,
			message:
				"Invalid ns descriptor command fixture: declared ns-command module default export must be a command object.",
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
