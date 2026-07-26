import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	ClinkrApp,
	LegacyClinkrGroup,
	ImmutableClinkrGroup,
	ok,
	type ClinkrCommandBuilder,
} from "@nseng-ai/clinkr";
import { runForTest } from "@nseng-ai/clinkr/testing";

const emptySchema = z.object({});

async function defineProbeCommand(commandBuilder: ClinkrCommandBuilder<string[]>, name: string) {
	return await commandBuilder.define({
		name,
		schema: emptySchema,
		resultSchema: z.any(),
		handler: async (calls) => {
			calls.push(name);
			return ok(name);
		},
		renderHuman: (value) => value,
	});
}

async function createProbeApp(loads: string[] = []) {
	return await ClinkrApp.create<string[]>(
		{ name: "probe", moduleUrl: import.meta.url, version: "1.0.0" },
		async (appBuilder) => {
			await appBuilder.defaultCommand(async (commandBuilder) => {
				loads.push("default");
				return await commandBuilder.defineDefault({
					schema: emptySchema,
					resultSchema: z.any(),
					handler: async (calls) => {
						calls.push("default");
						return ok("default");
					},
					renderHuman: (value) => value,
				});
			});
			appBuilder.command({ name: "first", aliases: ["one"] }, async (commandBuilder) => {
				loads.push("first");
				return await defineProbeCommand(commandBuilder, "first");
			});
			appBuilder.command({ name: "second", isHidden: true }, async (commandBuilder) => {
				loads.push("second");
				return await defineProbeCommand(commandBuilder, "second");
			});
			return await appBuilder.define();
		},
	);
}

async function runApp(app: Awaited<ReturnType<typeof createProbeApp>>, argv: string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context: string[] = [];
	const code = await app.run(argv, {
		context,
		io: {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		},
	});
	return { code, stdout: stdout.join(""), stderr: stderr.join(""), context };
}

describe("immutable Clinkr runtime", () => {
	test("loads only the selected route and caches success", async () => {
		const loads: string[] = [];
		const app = await createProbeApp(loads);
		expect(loads).toEqual([]);

		const first = await runApp(app, ["one"]);
		const second = await runApp(app, ["first"]);

		expect(first).toMatchObject({ code: 0, stdout: "first\n", context: ["first"] });
		expect(second).toMatchObject({ code: 0, stdout: "first\n", context: ["first"] });
		expect(loads).toEqual(["first"]);
	});

	test("loads nested groups and their eager defaults only along the selected path", async () => {
		const loads: string[] = [];
		const app = await ClinkrApp.create<string[]>(
			{ name: "probe", moduleUrl: import.meta.url },
			async (appBuilder) => {
				appBuilder.group({ name: "admin" }, async (groupBuilder) => {
					loads.push("admin");
					await groupBuilder.defaultCommand(async (commandBuilder) => {
						loads.push("admin-default");
						return await commandBuilder.defineDefault({
							schema: emptySchema,
							resultSchema: z.any(),
							handler: async (calls) => {
								calls.push("admin-default");
								return ok("admin-default");
							},
							renderHuman: (value) => value,
						});
					});
					return await groupBuilder.define();
				});
				appBuilder.group({ name: "other" }, async (groupBuilder) => {
					loads.push("other");
					return await groupBuilder.define();
				});
				return await appBuilder.define();
			},
		);

		const result = await runApp(app, ["admin"]);
		expect(result).toMatchObject({ code: 0, stdout: "admin-default\n" });
		expect(loads).toEqual(["admin", "admin-default"]);
	});

	test("keeps hidden routes out of help and completion without loading definitions", async () => {
		const loads: string[] = [];
		const app = await createProbeApp(loads);
		const help = await runApp(app, ["--help"]);
		const completion = await app.complete({ words: [""] }, { context: [] });

		expect(help.stdout).toContain("first");
		expect(help.stdout).not.toContain("second");
		expect(completion.candidates.map((candidate) => candidate.value)).toContain("first");
		expect(completion.candidates.map((candidate) => candidate.value)).not.toContain("second");
		expect(loads).toEqual([]);
	});

	test("does not infer aliases for immutable app routes", async () => {
		const app = await ClinkrApp.create<string[]>(
			{ name: "probe", moduleUrl: import.meta.url },
			async (appBuilder) => {
				appBuilder.command({ name: "list" }, async (commandBuilder) =>
					defineProbeCommand(commandBuilder, "list"),
				);
				return await appBuilder.define();
			},
		);
		const completion = await app.complete({ words: [""] }, { context: [] });
		expect(completion.candidates.map((candidate) => candidate.value)).not.toContain("ls");
	});

	test("reports dynamic completion errors with the full selected command path", async () => {
		const observed: unknown[] = [];
		const context: string[] = [];
		const app = await ClinkrApp.create<string[]>(
			{
				name: "probe",
				moduleUrl: import.meta.url,
				completion: {
					onProviderError: (event) => {
						observed.push(event);
						throw new Error("observer failed");
					},
				},
			},
			async (appBuilder) => {
				appBuilder.group({ name: "admin" }, async (groupBuilder) => {
					groupBuilder.command({ name: "choose" }, async (commandBuilder) =>
						commandBuilder.define({
							name: "choose",
							schema: z.object({ kind: z.enum(["one", "two"]) }),
							positionals: { kind: { position: 0 } },
							completionProvider: () => {
								throw new Error("provider failed");
							},
							handler: async () => ok(),
						}),
					);
					return await groupBuilder.define();
				});
				return await appBuilder.define();
			},
		);
		const request = { words: ["admin", "choose", ""] };

		const completion = await app.complete(request, { context });

		expect(completion.candidates.map((candidate) => candidate.value)).toEqual(["one", "two"]);
		expect(observed).toMatchObject([
			{ commandPath: ["admin", "choose"], request, context, error: expect.any(Error) },
		]);
	});

	test("shares an in-flight load and retries a failed transactional load", async () => {
		let attempts = 0;
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const app = await ClinkrApp.create<string[]>(
			{ name: "probe", moduleUrl: import.meta.url },
			async (appBuilder) => {
				appBuilder.command({ name: "work" }, async (commandBuilder) => {
					attempts += 1;
					if (attempts === 1) throw new Error("first load failed");
					await gate;
					return await defineProbeCommand(commandBuilder, "work");
				});
				return await appBuilder.define();
			},
		);

		await expect(runApp(app, ["work"])).rejects.toThrow("first load failed");
		const left = runApp(app, ["work"]);
		const right = runApp(app, ["work"]);
		expect(attempts).toBe(2);
		release?.();
		await expect(Promise.all([left, right])).resolves.toHaveLength(2);
		expect(attempts).toBe(2);
	});

	test("rejects route conflicts, double definition, and foreign builder results", async () => {
		await expect(
			ClinkrApp.create({ name: "probe", moduleUrl: import.meta.url }, async (appBuilder) => {
				appBuilder.command({ name: "alpha", aliases: ["same"] }, async (commandBuilder) =>
					commandBuilder.define({
						name: "alpha",
						schema: emptySchema,
						resultSchema: z.any(),
						handler: async () => ok(null),
					}),
				);
				appBuilder.group({ name: "same" }, async (groupBuilder) => groupBuilder.define());
				return await appBuilder.define();
			}),
		).rejects.toThrow("conflicts");

		await expect(
			ClinkrApp.create({ name: "probe", moduleUrl: import.meta.url }, async (appBuilder) => {
				const app = await appBuilder.define();
				await appBuilder.define();
				return app;
			}),
		).rejects.toThrow("already been defined");

		const foreign = await ClinkrApp.create(
			{ name: "foreign", moduleUrl: import.meta.url },
			async (builder) => builder.define(),
		);
		await expect(
			ClinkrApp.create({ name: "probe", moduleUrl: import.meta.url }, async () => foreign),
		).rejects.toThrow("different builder");
	});

	test("keeps groups non-executable and creates fresh Commander trees per run", async () => {
		expect(Reflect.has(ImmutableClinkrGroup.prototype, "run")).toBe(false);
		expect(Reflect.has(ImmutableClinkrGroup.prototype, "complete")).toBe(false);

		const app = await createProbeApp();
		const first = await runApp(app, ["first"]);
		const second = await runApp(app, ["first"]);
		expect(first).toEqual(second);
	});

	test("bypasses route loading for app version", async () => {
		const loads: string[] = [];
		const app = await createProbeApp(loads);
		const result = await runApp(app, ["--version"]);
		expect(result).toMatchObject({ code: 0, stdout: "1.0.0\n" });
		expect(loads).toEqual([]);
	});

	test("retains the legacy Commander runtime only as an internal lowering target", async () => {
		const runtime = new LegacyClinkrGroup<null>({ name: "probe" });
		runtime.command({
			name: "ping",
			schema: emptySchema,
			resultSchema: z.any(),
			handler: async () => ok("pong"),
			renderHuman: (value) => value,
		});
		const result = await runForTest(runtime, ["ping"], { context: null });
		expect(result).toMatchObject({ exitCode: 0, stdout: "pong\n", stderr: "" });
	});
});
