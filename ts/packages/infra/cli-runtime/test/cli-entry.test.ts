import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ClinkrGroup, failure, ok } from "@sdl/clinkr";
import { rawCommand } from "@sdl/clinkr/raw";
import {
	defineCli,
	isDirectCliInvocation,
	runClinkrCommand,
	runOperationCommand,
	type CliPrepareRunInput,
} from "@sdl/cli-runtime";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

interface TestContext {
	readonly value: string;
	readonly stdout: (text: string) => void;
}

interface TestDeps {
	readonly cwd?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	readonly label?: string | undefined;
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
			name: "@sdl/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		expect(cli.metadata).toEqual({
			packageName: "@sdl/example",
			packagePath: `packages/${root.split("/").at(-1)}`,
			binName: "example",
			binPath: "src/cli.ts",
			version: "1.2.3",
		});
		expect(cli.version).toBe("1.2.3");
		expect(cli.runtimeInfo()).toBe(
			`runtime: typescript\nentry_point: @sdl/example bin example -> ts/packages/${root.split("/").at(-1)}/src/cli.ts\n`,
		);
	});

	test("formats Bun runtime diagnostics", () => {
		const root = makePackage({ name: "sdlcc", version: "0.1.0", bin: { sdlcc: "./src/cli.ts" } });
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "bun",
			description: "TUI CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		expect(cli.runtimeInfo()).toBe(
			`runtime: bun\nentry_point: sdlcc bin sdlcc -> ts/packages/${root.split("/").at(-1)}/src/cli.ts\n`,
		);
	});

	test("passes resolved dependencies, IO, args, and metadata into prepareRun", async () => {
		const root = makePackage({
			name: "@sdl/example",
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
			buildCli: ({ name, description, version, runtimeInfo, buildState }) => {
				buildInputVersion = version;
				const group = new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo });
				group.command(
					rawCommand({
						name: "go",
						description: "Run test command.",
						schema: z.object({}),
						run: async (ctx) => {
							ctx.stdout(`${ctx.value}${buildState.suffix}`);
							return 7;
						},
					}),
				);
				return group;
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
		expect(prepareInput?.metadata.packageName).toBe("@sdl/example");
		expect(prepareInput?.io.canEmitAnsi).toBe(false);
		expect(buildInputVersion).toBe("1.2.3");
	});

	test("allows prepareRun to override Clinkr args", async () => {
		const root = makePackage({
			name: "@sdl/example",
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
			buildCli: ({ name, description, version, runtimeInfo }) => {
				const group = new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo });
				group.command({
					name: "go",
					description: "Run test command.",
					schema: z.object({}),
					handler: async (ctx) => {
						ctx.stdout(`${ctx.value}:context`);
						return ok("rendered");
					},
					renderHuman: (data) => data,
				});
				return group;
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
			name: "@sdl/example",
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
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		await expect(cli.run([], { stderr: (text) => stderrText.push(text) })).resolves.toBe(9);
		expect(stderrText).toEqual(["handled: expected failure\n"]);
	});

	test("rethrows errors that handleRunError declines", async () => {
		const root = makePackage({
			name: "@sdl/example",
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
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		await expect(cli.run([])).rejects.toThrow("unhandled failure");
	});

	test("returns handled prepare result without building Clinkr", async () => {
		const root = makePackage({
			name: "@sdl/example",
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

	test("fails loudly when package metadata has no version", () => {
		const root = makePackage({ name: "@sdl/example", bin: { example: "./src/cli.ts" } });
		expect(() => defineNoopCli(root)).toThrow(/Invalid CLI package metadata.*version/);
	});

	test("uses the package name when package metadata has no bin", () => {
		const root = makePackage({ name: "@sdl/example", version: "1.2.3" });
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		expect(cli.metadata.binName).toBe("example");
		expect(cli.metadata.binPath).toBe("(no package bin)");
	});

	test("fails loudly when package metadata has multiple bin entries", () => {
		const root = makePackage({
			name: "@sdl/example",
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
		buildCli: ({ name, description, version, runtimeInfo }) =>
			new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
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
