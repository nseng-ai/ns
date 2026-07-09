import { describe, expect, test } from "vitest";

import {
	defineCommand,
	defineExtension,
	defineRawCommand,
	failure,
	machineEnvelopeSchema,
	ok,
	okExit,
	validateExtensionDescriptor,
	validateLoadedCommandName,
	z,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";

const noopApi = {
	cwd: "/repo",
	env: {},
	exec: async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
	commandIo: {
		phase: () => {},
		notify: () => {},
		message: () => {},
		clearPhase: () => {},
	},
	textGenerator: { generateText: async (request) => ({ ok: true, text: request.prompt }) },
	progress: { isLive: false, phase: () => {} },
	renderCapabilities: { canEmitAnsi: false },
} satisfies NsExtensionApi;

describe("extension descriptor SDK", () => {
	test("accepts valid descriptors with nested groups, points, and bundled artifacts", () => {
		const listCommand = defineRawCommand({
			name: "list",
			summary: "List objectives.",
			description: "List objectives with machine output.",
			resultSchema: z.object({ ok: z.boolean() }),
			run: (_ctx, invocation) => ({ type: "ok", data: { ok: invocation.argv.length === 0 } }),
		});
		const descriptor = defineExtension({
			group: "objective",
			description: "Objective operations.",
			entries: [
				{ name: "list", load: () => ({ default: listCommand }) },
				{
					group: "exec",
					hidden: true,
					description: "Agent-only objective operations.",
					entries: [{ name: "tracking-gate", load: () => ({ default: listCommand }) }],
				},
			],
			points: [
				{
					id: "submit.pre",
					accepts: "hook",
					cardinality: "many",
					description: "Runs before submit.",
				},
			],
			bundledArtifacts: [
				{ kind: "skill", name: "objective", path: "./skills/objective", description: "Skill." },
			],
		});

		const parsed = validateExtensionDescriptor(descriptor);

		expect(parsed).toMatchObject({ ok: true });
	});

	test("reports malformed descriptor fields with field paths", () => {
		const parsed = validateExtensionDescriptor({
			description: "Bad.",
			entries: [{ name: "missing-load" }],
		});

		expect(parsed).toEqual({
			ok: false,
			message: expect.stringContaining("entries.0"),
		});
		expect(parsed.ok).toBe(false);
	});

	test("validates descriptor entry and loaded command name matches", () => {
		const command = defineRawCommand({
			name: "actual",
			summary: "Actual.",
			description: "Actual command.",
			resultSchema: z.object({}),
			run: () => ({ type: "ok", data: {} }),
		});

		expect(
			validateLoadedCommandName({ name: "expected", load: () => ({ default: command }) }, command),
		).toEqual({
			ok: false,
			message: 'Loaded command name mismatch: descriptor entry "expected" loaded command "actual".',
		});
	});

	test("raw commands receive the raw post-route argv tail", async () => {
		const command = defineRawCommand({
			name: "legacy",
			summary: "Wrap legacy CLI.",
			description: "Passes arguments to a legacy parser.",
			resultSchema: z.object({ argv: z.array(z.string()) }),
			run: (_ctx, invocation) => ({ type: "ok", data: { argv: [...invocation.argv] } }),
		});

		expect(await Promise.resolve(command.run(noopApi, { argv: ["--", "raw", "tail"] }))).toEqual({
			type: "ok",
			data: { argv: ["--", "raw", "tail"] },
		});
	});

	test("defineCommand adapts a clinkr-style spec and consumes invocation argv", async () => {
		const command = defineCommand({
			name: "hello",
			summary: "Say hello.",
			description: "Say hello to someone.",
			schema: z.object({ name: z.string() }),
			positionals: { name: { position: 0 } },
			resultSchema: z.object({ greeting: z.string() }),
			handler: async (_ctx, request) => okExit({ greeting: `hello ${request.name}` }),
		});

		await expect(command.run(noopApi, { argv: ["ns"] })).resolves.toEqual({
			type: "ok",
			data: { greeting: "hello ns" },
		});
	});

	test("exports neutral machine envelope schemas and constructors", () => {
		expect(
			machineEnvelopeSchema.parse({
				status: "failure",
				exitCode: 2,
				errorType: "x",
				message: "no",
			}),
		).toEqual({ status: "failure", exitCode: 2, errorType: "x", message: "no" });
		expect(failure("wrapped", "no", { exitCode: 3 })).toEqual({
			type: "failure",
			errorType: "wrapped",
			message: "no",
			data: { exitCode: 3 },
		});
		expect(ok("legacy helper remains available during migration")).toEqual({
			ok: true,
			message: "legacy helper remains available during migration",
		});
		expect(okExit("string payload")).toEqual({ type: "ok", data: "string payload" });
	});
});
