import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { failure, ok, type Caps } from "@nseng-ai/clinkr";
import { rawCommand } from "@nseng-ai/clinkr/raw";
import {
	defineCli,
	isDirectCliInvocation,
	runClinkrCommand,
	runOperationCommand,
	type CliEntrypointDeps,
	type CliPrepareRunInput,
} from "@nseng-ai/foundation/cli-runtime";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

interface TestContext {
	readonly value: string;
	readonly stdout: (text: string) => void;
}

interface TestDeps extends CliEntrypointDeps {
	readonly label?: string;
}

const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("isDirectCliInvocation", () => {
	test("matches real paths and ignores missing argv paths", () => {
		const root = makePackage({
			name: "example-cli",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cliPath = join(root, "src", "cli.ts");
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, cliPath)).toBe(true);
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, undefined)).toBe(false);
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, join(root, "missing.ts"))).toBe(
			false,
		);
	});
});

describe("runClinkrCommand", () => {
	test("preserves successful Clinkr exits", async () => {
		await expect(
			runClinkrCommand("example-error", async () => ok({ answer: 42 })),
		).resolves.toEqual({ type: "ok", data: { answer: 42 } });
	});

	test("converts thrown errors into failure exits", async () => {
		await expect(
			runClinkrCommand("example-error", async () => {
				throw new Error("boom");
			}),
		).resolves.toEqual({ type: "failure", errorType: "example-error", message: "boom" });
	});
});

describe("runOperationCommand", () => {
	test("preserves successful Clinkr exits", async () => {
		await expect(
			runOperationCommand({
				operation: "save",
				action: async () => ok({ answer: 42 }),
				failureFromError: () => failure("unused", "unused"),
			}),
		).resolves.toEqual({ type: "ok", data: { answer: 42 } });
	});

	test("maps thrown errors with operation context", async () => {
		const thrown = new Error("boom");
		let mappedOperation: string | undefined;
		let mappedError: unknown;

		await expect(
			runOperationCommand({
				operation: "save",
				action: async () => {
					throw thrown;
				},
				failureFromError: (operation, error) => {
					mappedOperation = operation;
					mappedError = error;
					return failure("example-save-failed", "boom", { code: "unexpected-error" });
				},
			}),
		).resolves.toEqual({
			type: "failure",
			errorType: "example-save-failed",
			message: "boom",
			data: { code: "unexpected-error" },
		});
		expect(mappedOperation).toBe("save");
		expect(mappedError).toBe(thrown);
	});
});

describe("defineCli", () => {
	test("reads package metadata and formats TypeScript runtime diagnostics", () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: () => {},
		});
		expect(cli.metadata).toEqual({
			packageName: "@nseng-ai/example",
			packagePath: `packages/${root.split("/").at(-1)}`,
			binName: "example",
			binPath: "src/cli.ts",
			version: "1.2.3",
		});
		expect(cli.version).toBe("1.2.3");
		expect(cli.runtimeInfo()).toBe(
			`runtime: typescript\nentry_point: @nseng-ai/example bin example -> ts/packages/${root.split("/").at(-1)}/src/cli.ts\n`,
		);
	});

	test("keeps executable description on the immutable app help surface", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const stdoutText: string[] = [];
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: ({ stdout }) => ({
				type: "run",
				context: { value: "prepared", stdout },
				buildState: undefined,
			}),
			buildCli: () => {},
		});

		await expect(cli.run(["--help"], { stdout: (text) => stdoutText.push(text) })).resolves.toBe(0);
		expect(stdoutText.join("")).toContain("Example CLI.");
	});

	test("formats Bun runtime diagnostics", () => {
		const root = makePackage({ name: "nscc", version: "0.1.0", bin: { nscc: "./src/cli.ts" } });
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "bun",
			description: "TUI CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: () => {},
		});
		expect(cli.runtimeInfo()).toBe(
			`runtime: bun\nentry_point: nscc bin nscc -> ts/packages/${root.split("/").at(-1)}/src/cli.ts\n`,
		);
	});

	test("passes resolved dependencies, IO, args, and metadata into prepareRun", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const stdoutText: string[] = [];
		const stderrText: string[] = [];
		let prepareInput: CliPrepareRunInput<TestDeps> | undefined;
		let buildInputVersion: string | undefined;
		const cli = defineCli<TestContext, TestDeps, { readonly suffix: string }>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: (input) => {
				prepareInput = input;
				return {
					type: "run",
					context: { value: `${input.deps.label}:${input.env.EXAMPLE_ENV}`, stdout: input.stdout },
					buildState: { suffix: "!" },
				};
			},
			buildCli: ({ appBuilder, version, buildState }) => {
				buildInputVersion = version;
				appBuilder.command(
					{ name: "go", description: "Run test command." },
					async (commandBuilder) =>
						await commandBuilder.define(
							rawCommand({
								name: "go",
								description: "Run test command.",
								run: async (ctx) => {
									ctx.stdout(`${ctx.value}${buildState.suffix}`);
									return 7;
								},
							}),
						),
				);
			},
		});
		const exitCode = await cli.run(["go"], {
			cwd: "/worktree",
			env: { EXAMPLE_ENV: "ready" },
			label: "label",
			stdout: (text) => stdoutText.push(text),
			stderr: (text) => stderrText.push(text),
		});
		expect(exitCode).toBe(7);
		expect(stdoutText).toEqual(["label:ready!"]);
		expect(stderrText).toEqual([]);
		expect(prepareInput?.args).toEqual(["go"]);
		expect(prepareInput?.cwd).toBe("/worktree");
		expect(prepareInput?.env.EXAMPLE_ENV).toBe("ready");
		expect(prepareInput?.metadata.packageName).toBe("@nseng-ai/example");
		expect(prepareInput?.io.canEmitAnsi).toBe(false);
		expect(buildInputVersion).toBe("1.2.3");
	});

	test("injects one render capability policy into prepareRun and command emission", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const colorCaps: Caps = {
			isTty: true,
			colorDepth: "truecolor",
			columns: 80,
			canRenderUnicode: true,
		};
		const stdoutText: string[] = [];
		let prepareIo: CliPrepareRunInput<TestDeps>["io"] | undefined;
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: ({ io, stdout }) => {
				prepareIo = io;
				return {
					type: "run",
					context: { value: "prepared", stdout },
					buildState: undefined,
				};
			},
			buildCli: ({ appBuilder }) => {
				appBuilder.command(
					{ name: "go", description: "Run test command." },
					async (commandBuilder) =>
						await commandBuilder.define({
							name: "go",
							schema: z.object({}),
							resultSchema: z.string(),
							handler: async () => ok("result"),
							renderHuman: () => "\u001b[31mcolored\u001b[0m",
						}),
				);
			},
		});

		const exitCode = await cli.run(["go"], {
			stdout: (text) => stdoutText.push(text),
			renderCapabilities: { canEmitAnsi: false, caps: colorCaps },
		});

		expect(exitCode).toBe(0);
		expect(prepareIo).toMatchObject({ canEmitAnsi: false, caps: colorCaps });
		expect(stdoutText).toEqual(["colored\n"]);
	});

	test("allows prepareRun to override Clinkr args", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const stdoutText: string[] = [];
		let prepareArgs: readonly string[] = [];
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: ({ args, stdout }) => {
				prepareArgs = args;
				return {
					type: "run",
					args: ["go"],
					context: { value: "prepared", stdout },
					buildState: undefined,
				};
			},
			buildCli: ({ appBuilder }) => {
				appBuilder.command(
					{ name: "go", description: "Run test command." },
					async (commandBuilder) =>
						await commandBuilder.define({
							name: "go",
							schema: z.object({}),
							resultSchema: z.string(),
							handler: async (ctx) => {
								ctx.stdout(`${ctx.value}:context`);
								return ok("rendered");
							},
							renderHuman: (data) => data,
						}),
				);
			},
		});
		const exitCode = await cli.run(["alias"], {
			stdout: (text) => stdoutText.push(text),
		});
		expect(exitCode).toBe(0);
		expect(prepareArgs).toEqual(["alias"]);
		expect(stdoutText).toEqual(["prepared:context", "rendered\n"]);
	});

	test("lets handleRunError normalize handled errors", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const stderrText: string[] = [];
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => {
				throw new Error("expected failure");
			},
			handleRunError: ({ error, stderr }) => {
				if (!(error instanceof Error)) return undefined;
				stderr(`handled: ${error.message}\n`);
				return 9;
			},
			buildCli: () => {},
		});
		await expect(cli.run([], { stderr: (text) => stderrText.push(text) })).resolves.toBe(9);
		expect(stderrText).toEqual(["handled: expected failure\n"]);
	});

	test("rethrows errors that handleRunError declines", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => {
				throw new Error("unhandled failure");
			},
			handleRunError: () => undefined,
			buildCli: () => {},
		});
		await expect(cli.run([])).rejects.toThrow("unhandled failure");
	});

	test("returns handled prepare result without building Clinkr", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 42 }),
			buildCli: () => {
				throw new Error("buildCli should not be called for handled invocations");
			},
		});
		await expect(cli.run(["go"])).resolves.toBe(42);
	});

	test("prepares before creating a fresh immutable app for every unhandled invocation", async () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const events: string[] = [];
		const cli = defineCli<TestContext, TestDeps, number>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => {
				events.push("prepare");
				return {
					type: "run",
					context: { value: "prepared", stdout: () => {} },
					buildState: events.length,
				};
			},
			buildCli: ({ appBuilder, buildState }) => {
				events.push(`build:${buildState}`);
				appBuilder.command({ name: "go" }, async (commandBuilder) => {
					events.push(`load:${buildState}`);
					return await commandBuilder.define(
						rawCommand({ name: "go", run: async () => buildState }),
					);
				});
			},
		});

		await expect(cli.run(["go"])).resolves.toBe(1);
		await expect(cli.run(["go"])).resolves.toBe(4);
		expect(events).toEqual(["prepare", "build:1", "load:1", "prepare", "build:4", "load:4"]);
	});

	test("fails loudly when package metadata has no version", () => {
		const root = makePackage({ name: "@nseng-ai/example", bin: { example: "./src/cli.ts" } });
		expect(() => defineNoopCli(root)).toThrow(/Invalid CLI package metadata.*version/);
	});

	test("uses the package name when package metadata has no bin", () => {
		const root = makePackage({ name: "@nseng-ai/example", version: "1.2.3" });
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: () => {},
		});
		expect(cli.metadata.binName).toBe("example");
		expect(cli.metadata.binPath).toBe("(no package bin)");
	});

	test("fails loudly when package metadata has multiple bin entries", () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { first: "./src/first.ts", second: "./src/second.ts" },
		});
		expect(() => defineNoopCli(root)).toThrow(/expected at most one bin entry, found 2/);
	});
});

function defineNoopCli(root: string): void {
	defineCli<TestContext, TestDeps, undefined>({
		metaUrl: packageMetaUrl(root),
		runtime: "typescript",
		description: "Example CLI.",
		prepareRun: () => ({ type: "handled", exitCode: 0 }),
		buildCli: () => {},
	});
}

function makePackage(packageJson: unknown): string {
	const root = mkdtempSync(join(tmpdir(), "asdl-cli-runtime-"));
	tempRoots.push(root);
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "cli.ts"), "#!/usr/bin/env node\n");
	writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson)}\n`);
	return root;
}

function packageMetaUrl(root: string): string {
	return pathToFileURL(join(root, "src", "cli.ts")).href;
}
