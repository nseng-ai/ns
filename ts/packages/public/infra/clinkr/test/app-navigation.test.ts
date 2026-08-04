import { z } from "zod";
import { expect, test, vi } from "vitest";

import { createClinkrApp, defineCommand, ok } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { defineRawCommand } from "@nseng-ai/clinkr/raw";

interface Context {
	readonly prefix: string;
}

function recursiveApp() {
	return createClinkrApp<Context>(
		{
			name: "contacts",
			requiresContext: true,
			version: "1.2.3",
			runtimeInfo: () => "runtime: test\n",
		},
		(composition) => {
			composition.source({ label: "fixture" }, (root) => {
				root.defaultCommand({ description: "Root default." }, () =>
					defineCommand({
						requiresContext: true,
						schema: z.object({ value: z.string().default("root") }),
						resultSchema: z.object({ value: z.string() }),
						handler: (context: Context, request) =>
							ok({ value: `${context.prefix}:${request.value}` }),
					}),
				);
				root.group(
					"people",
					{ description: "People commands.", summary: "Manage people.", aliases: ["p"] },
					(people) => {
						people.defaultCommand({ description: "List people." }, () =>
							defineCommand({
								requiresContext: true,
								schema: z.object({}),
								resultSchema: z.object({ value: z.string() }),
								handler: (context: Context) => ok({ value: `${context.prefix}:list` }),
							}),
						);
						people.command(
							"find",
							{
								description: "Find a person in the address book.",
								summary: "Find a person.",
								aliases: ["f"],
								helpGroup: "Contacts:",
							},
							() =>
								defineCommand({
									requiresContext: true,
									schema: z.object({ name: z.string().default("Ada") }),
									resultSchema: z.object({ value: z.string() }),
									handler: (context: Context, request) =>
										ok({ value: `${context.prefix}:${request.name}` }),
								}),
						);
						people.command(
							"secret",
							{ description: "Secret command.", aliases: ["s"], hidden: true },
							() =>
								defineCommand({
									requiresContext: true,
									schema: z.object({}),
									resultSchema: z.object({ value: z.string() }),
									handler: (context: Context) => ok({ value: `${context.prefix}:secret` }),
								}),
						);
						people.group("admin", { description: "Admin commands.", hidden: true }, (admin) => {
							admin.command("raw", { description: "Raw command." }, () =>
								defineRawCommand<Context>({
									requiresContext: true,
									run: ({ context, argv }) => {
										process.stdout.write(`${context.prefix}:${argv.join("|")}`);
										return argv.length;
									},
								}),
							);
						});
					},
				);
			});
		},
	);
}

const context = { prefix: "ctx" };

test("recursive named, aliased, and group-default commands dispatch through one app", async () => {
	const app = recursiveApp();
	const named = await runForCliTest(app, ["people", "find", "--name", "Grace"], { context });
	const aliased = await runForCliTest(app, ["p", "f"], { context });
	const groupDefault = await runForCliTest(app, ["people"], { context });
	expect(JSON.parse(named.stdout)).toEqual({ value: "ctx:Grace" });
	expect(JSON.parse(aliased.stdout)).toEqual({ value: "ctx:Ada" });
	expect(JSON.parse(groupDefault.stdout)).toEqual({ value: "ctx:list" });
});

test("named children and aliases win over root default positional parsing", async () => {
	for (const argv of [
		["people", "find"],
		["p", "f"],
	]) {
		const run = await runForCliTest(recursiveApp(), argv, { context });
		expect(JSON.parse(run.stdout)).toEqual({ value: "ctx:Ada" });
	}
});

test("scope help presents full canonical paths, command and group metadata, and hides hidden children", async () => {
	const root = await runForCliTest(recursiveApp(), ["--help"], { context });
	expect(root.stdout).toContain("Usage: contacts");
	expect(root.stdout).toContain("people|p");
	expect(root.stdout).toContain("Manage people.");
	const group = await runForCliTest(recursiveApp(), ["people", "--help"], { context });
	expect(group.stdout).toContain("Usage: contacts people");
	expect(group.stdout).toContain("Manage people.");
	expect(group.stdout).toContain("Contacts:\n  find|f");
	expect(group.stdout).toContain("Find a person.");
	expect(group.stdout).not.toContain("address book");
	expect(group.stdout).not.toContain("secret");
	expect(group.stdout).not.toContain("admin");
});

test("hidden named commands and groups remain invocable through aliases and canonical names", async () => {
	const hiddenCommand = await runForCliTest(recursiveApp(), ["people", "s"], { context });
	expect(JSON.parse(hiddenCommand.stdout)).toEqual({ value: "ctx:secret" });
	const hiddenGroup = await runForCliTest(recursiveApp(), ["people", "admin", "raw", "x"], {
		context,
	});
	expect(hiddenGroup).toEqual({ exitCode: 1, stdout: "ctx:x", stderr: "" });
});

test("bare scopes show help without a default and execute defaults when present", async () => {
	const noDefault = createClinkrApp({ name: "bare" }, (composition) => {
		composition.source({ label: "bare" }, (root) => {
			root.command("child", { description: "Child." }, () =>
				defineCommand({ schema: z.object({}), handler: () => ok() }),
			);
			root.group("empty", { description: "Empty group." }, () => {});
		});
	});
	for (const argv of [[], ["empty"], ["empty", "--help"]]) {
		const run = await runForCliTest(noDefault, argv);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Usage:");
	}
	const unknown = await runForCliTest(noDefault, ["empty", "missing"]);
	expect(unknown).toEqual({
		exitCode: 2,
		stdout: "",
		stderr: "clinkr: unknown route at empty missing\n",
	});
	const rootDefault = await runForCliTest(recursiveApp(), [], { context });
	const groupDefault = await runForCliTest(recursiveApp(), ["people"], { context });
	expect(JSON.parse(rootDefault.stdout)).toEqual({ value: "ctx:root" });
	expect(JSON.parse(groupDefault.stdout)).toEqual({ value: "ctx:list" });
});

test("selected help and schema follow canonical and alias routes", async () => {
	const selected = await runForCliTest(recursiveApp(), ["people", "find", "--help"], { context });
	expect(selected.stdout).toContain("Usage: contacts people find");
	expect(selected.stdout).toContain("--name");
	const escaped = await runForCliTest(recursiveApp(), ["people", "find", "--", "--help"], {
		context,
	});
	expect(escaped.exitCode).toBe(2);
	expect(escaped.stdout).not.toContain("Usage:");
	const schema = await runForCliTest(recursiveApp(), ["p", "f", "--json-schema"], { context });
	expect(schema.exitCode).toBe(0);
	expect(schema.stdout).toContain('"name"');
});

test("input-json works before and after nested routes and stdin is read only for execution", async () => {
	const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	for (const argv of [
		["--input-json", "people", "find"],
		["people", "find", "--input-json"],
	]) {
		const run = await runForCliTest(recursiveApp(), argv, { context, stdin: '{"name":"Lin"}' });
		expect(JSON.parse(run.stdout)).toEqual({ value: "ctx:Lin" });
	}
	const app = recursiveApp();
	for (const argv of [
		["--input-json", "people", "find", "--help"],
		["people", "find", "--input-json", "--json-schema"],
		["people", "find", "--input-json", "--name", "Ada"],
		["people", "find", "--input-json", "--input-json"],
	]) {
		const readStdin = vi.fn(async () => '{"name":"should-not-read"}');
		await app.run(argv, { context, readStdin, canEmitAnsi: false });
		expect(readStdin).not.toHaveBeenCalled();
	}
	stdout.mockRestore();
	stderr.mockRestore();
});

test("named and default raw commands receive untouched tails", async () => {
	const argv = ["--format", "json", "--help", "--", "x"];
	const named = await runForCliTest(recursiveApp(), ["people", "admin", "raw", ...argv], {
		context,
	});
	expect(named).toEqual({ exitCode: argv.length, stdout: `ctx:${argv.join("|")}`, stderr: "" });
	const rawDefault = createClinkrApp({ name: "raw-default" }, (composition) => {
		composition.source({ label: "raw-default" }, (root) => {
			root.defaultCommand({ description: "Raw default." }, () =>
				defineRawCommand({
					run: ({ argv: tail }) => {
						process.stdout.write(tail.join("|"));
						return tail.length;
					},
				}),
			);
		});
	});
	expect(await runForCliTest(rawDefault, argv)).toEqual({
		exitCode: argv.length,
		stdout: argv.join("|"),
		stderr: "",
	});
});

test("configured root built-ins bypass topology and do not become descendant options", async () => {
	let definitions = 0;
	const app = createClinkrApp(
		{ name: "builtins", version: "1.2.3", runtimeInfo: () => "runtime\n" },
		(composition) => {
			composition.source({ label: "fixture" }, (root) => {
				root.defaultCommand({ description: "Default." }, () => {
					definitions += 1;
					return defineCommand({ schema: z.object({}), handler: () => ok() });
				});
				root.group("nested", { description: "Nested." }, (nested) => {
					nested.command("leaf", { description: "Leaf." }, () => {
						definitions += 1;
						return defineCommand({ schema: z.object({}), handler: () => ok() });
					});
				});
			});
		},
	);
	expect(await runForCliTest(app, ["--format", "json", "--version"])).toMatchObject({
		exitCode: 0,
		stdout: "1.2.3\n",
	});
	expect(await runForCliTest(app, ["--runtime"])).toMatchObject({
		exitCode: 0,
		stdout: "runtime\n",
	});
	expect(definitions).toBe(0);
	const subgroup = await runForCliTest(app, ["nested", "--help"]);
	expect(subgroup.stdout).not.toContain("--version");
	expect(subgroup.stdout).not.toContain("--runtime");
	expect(definitions).toBe(0);
});

test("selected loads share concurrent work, cache success, retry failure, and use fresh Commander", async () => {
	let loads = 0;
	let fail = true;
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const app = createClinkrApp({ name: "cache" }, (composition) => {
		composition.source({ label: "cache" }, (root) => {
			root.command("item", { description: "Item." }, async () => {
				loads += 1;
				if (fail) {
					fail = false;
					throw new Error("temporary load failure");
				}
				await gate;
				return defineCommand({
					schema: z.object({ value: z.string() }),
					handler: () => ok(),
				});
			});
		});
	});
	await expect(app.run(["item", "--value", "failed"])).rejects.toThrow("temporary load failure");
	const first = app.run(["item", "--value", "First"]);
	const second = app.run(["item", "--value", "Second"]);
	release?.();
	await expect(Promise.all([first, second])).resolves.toEqual([0, 0]);
	await expect(app.run(["item", "--value", "Third"])).resolves.toBe(0);
	expect(loads).toBe(2);
});

test("context mismatch and handler or outcome exceptions propagate", async () => {
	const mismatch = createClinkrApp({ name: "mismatch" }, (composition) => {
		composition.source({ label: "mismatch" }, (root) => {
			root.command("bad", { description: "Bad." }, () =>
				defineCommand({
					requiresContext: true,
					schema: z.object({}),
					handler: (_context: Context) => ok(),
				}),
			);
		});
	});
	await expect(mismatch.run(["bad"])).rejects.toThrow("context mode does not match");
	const exceptional = createClinkrApp({ name: "exceptional" }, (composition) => {
		composition.source({ label: "exceptional" }, (root) => {
			root.command("throw", { description: "Throw." }, () =>
				defineCommand({ schema: z.object({}), handler: () => Promise.reject(new Error("boom")) }),
			);
			root.command("invalid", { description: "Invalid." }, () =>
				defineCommand({
					schema: z.object({}),
					resultSchema: z.object({ value: z.string() }),
					handler: () => ok({ value: 1 } as never),
				}),
			);
		});
	});
	await expect(exceptional.run(["throw"])).rejects.toThrow("boom");
	await expect(exceptional.run(["invalid"])).rejects.toThrow();
});

test("structural topology issues make the entire opened scope unavailable", async () => {
	const app = createClinkrApp({ name: "issues" }, (composition) => {
		composition.source({ label: "alpha" }, (root) => {
			root.command("healthy", { description: "Healthy." }, () =>
				defineCommand({
					schema: z.object({}),
					resultSchema: z.object({ value: z.string() }),
					handler: () => ok({ value: "ready" }),
				}),
			);
			root.command("shared", { description: "Shared alpha." }, () =>
				defineCommand({ schema: z.object({}), handler: () => ok() }),
			);
		});
		composition.source({ label: "beta" }, (root) => {
			root.command("shared", { description: "Shared beta." }, () =>
				defineCommand({ schema: z.object({}), handler: () => ok() }),
			);
		});
	});
	for (const argv of [["healthy"], ["--help"], ["shared"]]) {
		const result = await runForCliTest(app, argv);
		expect(result).toMatchObject({ exitCode: 2, stdout: "" });
		expect(result.stderr).toContain(
			'command/command collision at shared between sources "alpha" and "beta"',
		);
	}
});

test("depth counters prove immediate-child laziness through help, schema, and execution", async () => {
	const opened: string[] = [];
	const loaded: string[] = [];
	const app = createClinkrApp({ name: "deep" }, (composition) => {
		composition.source({ label: "deep" }, (root) => {
			let scope = root;
			for (let depth = 1; depth <= 5; depth += 1) {
				const name = `level-${depth}`;
				scope.group(name, { description: name }, (child) => {
					opened.push(name);
					child.command("leaf", { description: "Leaf." }, () => {
						loaded.push(name);
						return defineCommand({ schema: z.object({}), handler: () => ok() });
					});
					scope = child;
				});
			}
		});
	});
	// Programmatic group callbacks declare metadata at composition time; command definitions remain lazy.
	expect(opened).toHaveLength(5);
	expect(loaded).toEqual([]);
	await runForCliTest(app, ["--help"]);
	await runForCliTest(app, ["level-1", "level-2", "--help"]);
	expect(loaded).toEqual([]);
	await runForCliTest(app, ["level-1", "level-2", "leaf", "--json-schema"]);
	expect(loaded).toEqual(["level-2"]);
	await runForCliTest(app, ["level-1", "level-2", "leaf"]);
	expect(loaded).toEqual(["level-2"]);
});
