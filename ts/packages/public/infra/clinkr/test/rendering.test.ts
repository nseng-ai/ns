import { z } from "zod";
import { describe, expect, test } from "vitest";

import {
	LegacyClinkrGroup,
	negative,
	ok,
	renderCapabilitiesForTerminal,
	resolveRenderCapabilities,
} from "../src/index.ts";
import type { Caps } from "../src/caps.ts";
import type { ClinkrExit } from "../src/exit.ts";
import { runForTest } from "../src/testing/index.ts";

const payloadSchema = z.object({ count: z.number() });

function buildGroup(outcome: "ok" | "negative") {
	let humanCalls = 0;
	let markdownCalls = 0;
	const group = new LegacyClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "act",
		schema: z.object({}),
		resultSchema: payloadSchema,
		negativeSchema: payloadSchema,
		handler: async () => (outcome === "ok" ? ok({ count: 2 }) : negative("none", { count: 0 })),
		renderHuman: (data) => {
			humanCalls += 1;
			return `plans: ${data.count}`;
		},
		renderMarkdown: (data) => {
			markdownCalls += 1;
			return `- plans: ${data.count}`;
		},
	});
	return { group, humanCalls: () => humanCalls, markdownCalls: () => markdownCalls };
}

describe("render capabilities", () => {
	test("derives ANSI support from terminal caps", () => {
		const caps: Caps = {
			isTty: true,
			colorDepth: "ansi16",
			columns: 80,
			canRenderUnicode: true,
		};
		expect(renderCapabilitiesForTerminal(caps)).toEqual({ canEmitAnsi: true, caps });
		expect(resolveRenderCapabilities({ canEmitAnsi: false })).toMatchObject({ isTty: false });
	});
});

describe("command-level rendering", () => {
	test("renders ok and negative typed data through the command renderer", async () => {
		const okRun = await runForTest(buildGroup("ok").group, ["act"], { context: null });
		const negativeRun = await runForTest(buildGroup("negative").group, ["act"], {
			context: null,
		});
		expect(okRun).toMatchObject({ exitCode: 0, stdout: "plans: 2\n", stderr: "" });
		expect(negativeRun).toMatchObject({ exitCode: 1, stdout: "plans: 0\n", stderr: "" });
	});

	test("uses Markdown, then human, then indented JSON fallback", async () => {
		const markdown = await runForTest(buildGroup("ok").group, ["act", "--format", "markdown"], {
			context: null,
		});
		expect(markdown.stdout).toBe("- plans: 2\n");

		const humanFallback = new LegacyClinkrGroup<null>({ name: "probe" });
		humanFallback.command({
			name: "act",
			schema: z.object({}),
			resultSchema: payloadSchema,
			handler: async () => ok({ count: 2 }),
			renderHuman: (data) => `plans: ${data.count}`,
		});
		expect(
			(await runForTest(humanFallback, ["act", "--format", "markdown"], { context: null })).stdout,
		).toBe("plans: 2\n");

		const jsonFallback = new LegacyClinkrGroup<null>({ name: "probe" });
		jsonFallback.command({
			name: "act",
			schema: z.object({}),
			resultSchema: payloadSchema,
			handler: async () => ok({ count: 2 }),
		});
		expect((await runForTest(jsonFallback, ["act"], { context: null })).stdout).toBe(
			'{\n  "count": 2\n}\n',
		);
	});

	test("bodyless success emits no human body and omits JSON data", async () => {
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({ name: "act", schema: z.object({}), handler: async () => ok() });
		const human = await runForTest(group, ["act"], { context: null });
		const json = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(human.stdout).toBe("");
		expect(JSON.parse(json.stdout)).toEqual({ status: "ok", exitCode: 0 });
	});
});

describe("outcome validation", () => {
	test("rejects missing, unexpected, and schema-invalid data as programmer errors", async () => {
		const cases: ReadonlyArray<{
			resultSchema?: z.ZodType;
			handler: () => Promise<ClinkrExit<unknown>>;
		}> = [
			{ resultSchema: payloadSchema, handler: async () => ok() },
			{ handler: async () => ok({ count: 2 }) },
			{ resultSchema: payloadSchema, handler: async () => ok({ count: "bad" }) },
		];
		for (const spec of cases) {
			const group = new LegacyClinkrGroup<null>({ name: "probe", validateOutcomes: true });
			group.command({ name: "act", schema: z.object({}), ...spec });
			await expect(runForTest(group, ["act"], { context: null })).rejects.toThrow();
		}
	});

	test("z.any is the explicit untyped data escape hatch", async () => {
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			resultSchema: z.any(),
			handler: async () => ok({ arbitrary: true }),
		});
		await expect(runForTest(group, ["act"], { context: null })).resolves.toMatchObject({
			exitCode: 0,
		});
	});
});
