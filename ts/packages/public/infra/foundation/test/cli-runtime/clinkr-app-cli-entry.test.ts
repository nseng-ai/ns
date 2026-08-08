import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createClinkrApp, defineCommand, ok } from "@nseng-ai/clinkr/app";
import { defineRawCommand } from "@nseng-ai/clinkr/raw";
import {
	defineClinkrAppCli,
	type ClinkrAppCliEntrypointDeps,
	type ClinkrAppCliPrepareRunInput,
} from "@nseng-ai/foundation/cli-runtime";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

interface TestContext {
	readonly prefix: string;
}

interface TestDeps extends ClinkrAppCliEntrypointDeps {
	readonly label?: string;
}

interface CreateEchoAppOptions {
	readonly ansi?: boolean;
	readonly throws?: boolean;
}

interface DefineTestCliOptions extends CreateEchoAppOptions {
	readonly handleRunError?: () => number | undefined;
}

const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("defineClinkrAppCli", () => {
	test("reads package metadata once and exposes runtime diagnostics", () => {
		const root = makePackage({
			name: "@nseng-ai/example",
			version: "1.2.3",
			bin: { example: "./src/cli.ts" },
		});
		const cli = defineTestCli(root);
		writeFileSync(join(root, "package.json"), "not json\n");

		expect(cli.metadata).toMatchObject({
			packageName: "@nseng-ai/example",
			binName: "example",
			binPath: "src/cli.ts",
			version: "1.2.3",
		});
		expect(cli.version).toBe("1.2.3");
		expect(cli.runtimeInfo()).toContain(
			"runtime: typescript\nentry_point: @nseng-ai/example bin example ->",
		);
	});

	test("prepares before creating a fresh app and forwards lifecycle inputs", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const stdout: string[] = [];
		const stderr: string[] = [];
		let prepareInput: ClinkrAppCliPrepareRunInput<TestDeps> | undefined;
		let builds = 0;
		const cli = defineClinkrAppCli<TestContext, TestDeps, number>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: (input) => {
				prepareInput = input;
				return {
					type: "run",
					args: ["--value", "rewritten"],
					context: { prefix: `${input.deps.label}:${input.env.MODE}` },
					buildState: ++builds,
				};
			},
			buildApp: ({ name, buildState }) => createEchoApp(name, `#${buildState}`),
		});
		const deps = {
			label: "prepared",
			cwd: "/worktree",
			env: { MODE: "ready" },
			stdout: (text: string) => stdout.push(text),
			stderr: (text: string) => stderr.push(text),
		};

		await expect(cli.run(["ignored"], deps)).resolves.toBe(0);
		await expect(cli.run(["ignored"], deps)).resolves.toBe(0);

		expect(stdout).toEqual(["prepared:ready:rewritten#1\n", "prepared:ready:rewritten#2\n"]);
		expect(stderr).toEqual([]);
		expect(prepareInput).toMatchObject({ args: ["ignored"], cwd: "/worktree" });
		expect(prepareInput?.metadata.packageName).toBe("example");
	});

	test("returns handled preparation without creating an app", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const cli = defineClinkrAppCli<TestContext>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 41 }),
			buildApp: () => {
				throw new Error("app must not be created");
			},
		});
		await expect(cli.run([])).resolves.toBe(41);
	});

	test("supplies injected stdin and ANSI capability to the modern app", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const output: string[] = [];
		const cli = defineTestCli(root, { ansi: true });
		await expect(
			cli.run(["--input-json"], {
				readJsonInput: async () => '{"value":"stdin"}',
				canEmitAnsi: true,
				stdout: (text) => output.push(text),
			}),
		).resolves.toBe(0);
		expect(output.join("")).toContain("\u001b[31mprepared:stdin\u001b[0m");
	});

	test("does not intercept process writers while an app run is pending", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const stdout: string[] = [];
		const stderr: string[] = [];
		let releaseRun: (() => void) | undefined;
		const runReleased = new Promise<void>((resolve) => {
			releaseRun = resolve;
		});
		let markRunPending: (() => void) | undefined;
		const runPending = new Promise<void>((resolve) => {
			markRunPending = resolve;
		});
		const cli = defineClinkrAppCli<TestContext>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "run", context: { prefix: "prepared" }, buildState: undefined }),
			buildApp: ({ name }) =>
				createClinkrApp<TestContext>({ name, requiresContext: true }, (composition) => {
					composition.source({ label: "pending" }, (scope) => {
						scope.defaultCommand({ description: "Pending command." }, () =>
							defineCommand<TestContext, z.ZodObject, z.ZodString>({
								requiresContext: true,
								schema: z.object({}),
								resultSchema: z.string(),
								handler: async () => {
									markRunPending?.();
									await runReleased;
									return ok("command output");
								},
							}),
						);
					});
				}),
		});

		const running = cli.run([], {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});
		await runPending;
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
		if (releaseRun === undefined) throw new Error("Expected pending run resolver");
		releaseRun();
		await expect(running).resolves.toBe(0);

		expect(stdout.join("")).toBe('"command output"\n');
		expect(stderr).toEqual([]);
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("captures app output and restores both process writers after success and throw", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const stdout: string[] = [];
		const stderr: string[] = [];
		const cli = defineTestCli(root);

		for (const args of [["--help"], ["--value", "json", "--format", "json"], ["--unknown"]]) {
			await cli.run(args, {
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			});
		}
		const captured = stdout.join("") + stderr.join("");
		expect(captured).toContain("Echo a value.");
		expect(captured).toContain('"status": "success"');
		expect(captured).toContain("unknown option");
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);

		const throwing = defineTestCli(root, { throws: true });
		await expect(throwing.run([], { stdout: () => {}, stderr: () => {} })).rejects.toThrow(
			"app failed",
		);
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("streams split raw UTF-8 through independent configured output channels", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const stdout: string[] = [];
		const stderr: string[] = [];
		const bytes = new TextEncoder().encode("A🙂B");
		const cli = defineClinkrAppCli<TestContext>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Raw CLI.",
			prepareRun: () => ({ type: "run", context: { prefix: "unused" }, buildState: undefined }),
			buildApp: ({ name }) =>
				createClinkrApp<TestContext>({ name, requiresContext: true }, (composition) => {
					composition.source({ label: "raw" }, (scope) => {
						scope.defaultCommand({ description: "Raw output." }, () =>
							defineRawCommand<TestContext>({
								requiresContext: true,
								run: ({ output }) => {
									output.writeStdout(bytes.subarray(0, 3));
									output.writeStdout(bytes.subarray(3));
									output.writeStderr(new TextEncoder().encode("error"));
									return 17;
								},
							}),
						);
					});
				}),
		});

		await expect(
			cli.run([], {
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			}),
		).resolves.toBe(17);
		expect(stdout.join("")).toBe("A🙂B");
		expect(stderr.join("")).toBe("error");
	});

	test("handles accepted errors and propagates declined errors", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const handled = defineTestCli(root, { throws: true, handleRunError: () => 9 });
		const declined = defineTestCli(root, {
			throws: true,
			handleRunError: () => undefined,
		});
		await expect(handled.run([])).resolves.toBe(9);
		await expect(declined.run([])).rejects.toThrow("app failed");
	});

	test("runIfMain runs direct invocation and assigns process.exitCode", async () => {
		const root = makePackage({ name: "example", version: "1.0.0" });
		const cli = defineClinkrAppCli<TestContext>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 37 }),
			buildApp: () => createEchoApp("example", ""),
		});
		const previousExitCode = process.exitCode;
		try {
			await cli.runIfMain({
				isImportMetaMain: false,
				argv: ["node", join(root, "src", "cli.ts")],
			});
			expect(process.exitCode).toBe(37);
		} finally {
			process.exitCode = previousExitCode;
		}
	});
});

function defineTestCli(root: string, options: DefineTestCliOptions = {}) {
	return defineClinkrAppCli<TestContext>({
		metaUrl: packageMetaUrl(root),
		runtime: "typescript",
		description: "Example CLI.",
		prepareRun: () => ({ type: "run", context: { prefix: "prepared" }, buildState: undefined }),
		buildApp: ({ name }) => createEchoApp(name, "", options),
		...optionalEntry("handleRunError", options.handleRunError),
	});
}

function createEchoApp(name: string, suffix: string, options: CreateEchoAppOptions = {}) {
	return createClinkrApp<TestContext>({ name, requiresContext: true }, (composition) => {
		composition.source({ label: "test" }, (root) => {
			root.defaultCommand({ description: "Echo a value." }, () =>
				defineCommand<TestContext, z.ZodObject<{ value: z.ZodDefault<z.ZodString> }>, z.ZodString>({
					requiresContext: true,
					schema: z.object({ value: z.string().default("default") }),
					resultSchema: z.string(),
					handler: (context, request) => {
						if (options.throws === true) throw new Error("app failed");
						return ok(`${context.prefix}:${request.value}${suffix}`);
					},
					renderHuman: (value) => (options.ansi === true ? `\u001b[31m${value}\u001b[0m` : value),
				}),
			);
		});
	});
}

function makePackage(packageJson: unknown): string {
	const root = mkdtempSync(join(tmpdir(), "foundation-modern-cli-"));
	tempRoots.push(root);
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "cli.ts"), "#!/usr/bin/env node\n");
	writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson)}\n`);
	return root;
}

function packageMetaUrl(root: string): string {
	return pathToFileURL(join(root, "src", "cli.ts")).href;
}
