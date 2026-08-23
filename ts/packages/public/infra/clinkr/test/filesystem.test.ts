import { join } from "node:path";

import {
	addClinkrCommandStructure,
	ClinkrApp,
	createClinkrApp,
	inspectClinkrCommandStructure,
} from "@nseng-ai/clinkr";
import { runForTest } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

import { clearAttempts, readAttempts } from "./fixtures/filesystem/retry/state.ts";
import { clearLoads, readLoads } from "./fixtures/filesystem/selected/log.ts";

const fixtureRoot = join(import.meta.dirname, "fixtures/filesystem");

describe("filesystem command structures", () => {
	test("creates an app from root defaults, named commands, nested groups, and explicit aliases", async () => {
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "basic"),
		});

		await expect(runForTest(app, [])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "default\n",
		});
		await expect(runForTest(app, ["hi", "--name", "Ada"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "Hello, Ada.\n",
		});
		await expect(runForTest(app, ["admin"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "admin-default\n",
		});
		await expect(runForTest(app, ["admin", "secret"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "secret\n",
		});
	});

	test("composes a filesystem command structure with programmatic routes", async () => {
		const app = await ClinkrApp.create(
			{ name: "fixture", moduleUrl: import.meta.url },
			async (appBuilder) => {
				await addClinkrCommandStructure(appBuilder, join(fixtureRoot, "basic"));
				appBuilder.command(
					{ name: "programmatic" },
					async (commandBuilder) =>
						await commandBuilder.define({
							name: "programmatic",
							isRawExit: true,
							run: async (_context, invocation) => {
								invocation.io.stdout("programmatic\n");
								return 0;
							},
						}),
				);
				return await appBuilder.define();
			},
		);

		await expect(runForTest(app, ["hi", "--name", "Ada"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "Hello, Ada.\n",
		});
		await expect(runForTest(app, ["programmatic"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "programmatic\n",
		});
	});

	test("inspects route metadata and mounts selected routes with mapped invocation context", async () => {
		const routes = await inspectClinkrCommandStructure(join(fixtureRoot, "basic"));
		expect(routes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "command", path: ["hello"] }),
				expect.objectContaining({ type: "group", path: ["admin"] }),
			]),
		);
		const app = await ClinkrApp.create<{ readonly nested: { readonly value: string } }>(
			{ name: "fixture", moduleUrl: import.meta.url },
			async (appBuilder) => {
				await addClinkrCommandStructure<
					{ readonly nested: { readonly value: string } },
					{ readonly value: string }
				>(appBuilder, join(fixtureRoot, "basic"), {
					include: (route) => route.path[0] === "hello",
					mapContext: (context) => context.nested,
				});
				return await appBuilder.define();
			},
		);

		await expect(
			runForTest(app, ["hello", "--name", "Ada"], { context: { nested: { value: "x" } } }),
		).resolves.toMatchObject({ exitCode: 0, stdout: "Hello, Ada.\n" });
		const help = await runForTest(app, ["--help"], { context: { nested: { value: "x" } } });
		expect(help.stdout).not.toContain("admin");
	});

	test("keeps hidden groups out of help", async () => {
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "basic"),
		});
		const help = await runForTest(app, ["admin", "--help"]);

		expect(help.stdout).not.toContain("secret");
	});

	test("evaluates metadata modules eagerly and only the selected command module", async () => {
		clearLoads();
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "selected"),
		});
		const eagerLoads = [
			"first:metadata-module",
			"first:metadata-call",
			"second:metadata-module",
			"second:metadata-call",
		];
		expect(readLoads()).toEqual(eagerLoads);

		await runForTest(app, ["--help"]);
		await app.complete({ words: [""] });
		expect(readLoads()).toEqual(eagerLoads);

		await runForTest(app, ["first", "--help"]);
		expect(readLoads()).toEqual([
			"first:metadata-module",
			"first:metadata-call",
			"second:metadata-module",
			"second:metadata-call",
			"first:command-module",
			"first:command-call",
		]);

		await runForTest(app, ["second", "--json-schema"]);
		expect(readLoads()).toEqual([
			...eagerLoads,
			"first:command-module",
			"first:command-call",
			"second:command-module",
			"second:command-call",
		]);

		await runForTest(app, ["first"]);
		await runForTest(app, ["first"]);
		expect(readLoads()).toEqual([
			"first:metadata-module",
			"first:metadata-call",
			"second:metadata-module",
			"second:metadata-call",
			"first:command-module",
			"first:command-call",
			"second:command-module",
			"second:command-call",
			"first:handler",
			"first:handler",
		]);
	});

	test("retries failed selected definitions and caches only successful loads", async () => {
		clearAttempts();
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "retry"),
		});

		await expect(runForTest(app, ["work"])).rejects.toThrow("first definition failed");
		await expect(runForTest(app, ["work"])).resolves.toMatchObject({
			exitCode: 0,
			stdout: "recovered\n",
		});
		await runForTest(app, ["work"]);
		expect(readAttempts()).toBe(2);
	});

	test("rejects relative command directories without cwd resolution", async () => {
		await expect(
			createClinkrApp({ name: "fixture", commandDirectory: "./commands" }),
		).rejects.toThrow("commandDirectory must be absolute");
	});

	test.each([
		["incomplete-metadata", "missing command.ts"],
		["incomplete-command", "missing metadata.ts"],
	])("rejects an incomplete command pair in %s eagerly", async (fixture, message) => {
		await expect(
			createClinkrApp({ name: "fixture", commandDirectory: join(fixtureRoot, fixture) }),
		).rejects.toThrow(message);
	});

	test("rejects malformed metadata exports eagerly", async () => {
		await expect(
			createClinkrApp({
				name: "fixture",
				commandDirectory: join(fixtureRoot, "malformed-metadata"),
			}),
		).rejects.toThrow("must export metadata()");
	});

	test("rejects malformed command exports only after selection", async () => {
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "malformed"),
		});
		await expect(runForTest(app, ["bad"])).rejects.toThrow("must export command()");
	});

	test("rejects command definitions that do not come from defineCommand only after selection", async () => {
		const app = await createClinkrApp({
			name: "fixture",
			commandDirectory: join(fixtureRoot, "wrong-definition"),
		});

		await expect(runForTest(app, ["wrong"])).rejects.toThrow(
			"must return a definition created by defineCommand()",
		);
	});
});
