import { clinkrSpecForRun, createUnavailableInteraction, isClinkrRun } from "@nseng-ai/sdk/command";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	createRealFirstPartyCommandContext,
	defineFirstPartyCommand,
	materializeFirstPartyCommand,
} from "../../src/kit/index.ts";

const requestSchema = z.object({ value: z.string() });

const command = defineFirstPartyCommand({
	name: "probe",
	summary: "Probe first-party binding.",
	clinkr: {
		schema: requestSchema,
		resultSchema: z.string(),
		completions: (context, bundle, request) => [
			{
				value: `${context.env.PROBE ?? "missing"}:${bundle.cwd}:${bundle.ns.catalog.has("present")}:${request.current}`,
				type: "positional-value",
			},
		],
		handler: (context, _bundle, request) => ({
			type: "ok",
			data: `${context.env.PROBE ?? "missing"}:${request.value}`,
		}),
	},
});

describe("first-party command binding", () => {
	test("materializes a context-free clinkr command with the supplied typed context", async () => {
		const context = createRealFirstPartyCommandContext({
			env: { PROBE: "bound" },
			textGenerator: { generateText: async () => ({ ok: false, error: "unused" }) },
			commandRunner: async () => ({
				type: "exited",
				code: 0,
				signal: null,
				stdout: "",
				stderr: "",
			}),
		});
		const materialized = materializeFirstPartyCommand(command, context);
		expect(isClinkrRun(materialized.run)).toBe(true);
		if (!isClinkrRun(materialized.run)) return;

		const result = await materialized.run(
			{
				cwd: "/work",
				ns: { catalog: { has: () => false } },
				caps: { canEmitAnsi: false },
				events: { isLive: false, emit: () => {} },
				interact: createUnavailableInteraction(),
			},
			{ value: "request" },
		);

		expect(result).toEqual({ type: "ok", data: "bound:request" });
		const completion = await clinkrSpecForRun(materialized.run).completions?.(
			{ cwd: "/completion", ns: { catalog: { has: (name) => name === "present" } } },
			{ words: [], current: "prefix", previous: [], args: [], positionalIndex: 0 },
		);
		expect(completion).toEqual([
			{ value: "bound:/completion:true:prefix", type: "positional-value" },
		]);
	});
});
