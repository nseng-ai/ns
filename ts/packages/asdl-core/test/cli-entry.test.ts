import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ClinkrGroup } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { defineCli, isDirectCliInvocation, type CliPrepareRunInput } from "@asdl/core/cli-entry";
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
		const root = makePackage({ name: "example-cli", version: "1.2.3", bin: { example: "./src/cli.ts" } });
		const cliPath = join(root, "src", "cli.ts");
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, cliPath)).toBe(true);
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, undefined)).toBe(false);
		expect(isDirectCliInvocation(pathToFileURL(cliPath).href, join(root, "missing.ts"))).toBe(false);
	});
});

describe("defineCli", () => {
	test("reads package metadata and formats TypeScript runtime diagnostics", () => {
		const root = makePackage({ name: "@asdl/example", version: "1.2.3", bin: { example: "./src/cli.ts" } });
		const cli = defineCli<TestContext, TestDeps, undefined>({
			metaUrl: packageMetaUrl(root),
			runtime: "typescript",
			description: "Example CLI.",
			prepareRun: () => ({ type: "handled", exitCode: 0 }),
			buildCli: ({ name, description, version, runtimeInfo }) =>
				new ClinkrGroup<TestContext>({ name, description, version, runtimeInfo }),
		});
		expect(cli.metadata).toEqual({
			packageName: "@asdl/example",
			packageDirName: root.split("/").at(-1),
			binName: "example",
			binPath: "src/cli.ts",
			version: "1.2.3",
		});
		expect(cli.version).toBe("1.2.3");
		expect(cli.runtimeInfo()).toBe(
			`runtime: typescript\nentry_point: @asdl/example bin example -> ts/packages/${root.split("/").at(-1)}/src/cli.ts\n`,
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
		const root = makePackage({ name: "@asdl/example", version: "1.2.3", bin: { example: "./src/cli.ts" } });
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
		expect(prepareInput?.metadata.packageName).toBe("@asdl/example");
		expect(prepareInput?.io.canEmitAnsi).toBe(false);
		expect(buildInputVersion).toBe("1.2.3");
	});

	test("returns handled prepare result without building Clinkr", async () => {
		const root = makePackage({ name: "@asdl/example", version: "1.2.3", bin: { example: "./src/cli.ts" } });
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
		const root = makePackage({ name: "@asdl/example", bin: { example: "./src/cli.ts" } });
		expect(() => defineNoopCli(root)).toThrow(/Invalid CLI package metadata.*version/);
	});

	test("fails loudly when package metadata has no bin", () => {
		const root = makePackage({ name: "@asdl/example", version: "1.2.3" });
		expect(() => defineNoopCli(root)).toThrow(/Invalid CLI package metadata.*bin/);
	});

	test("fails loudly when package metadata has multiple bin entries", () => {
		const root = makePackage({
			name: "@asdl/example",
			version: "1.2.3",
			bin: { first: "./src/first.ts", second: "./src/second.ts" },
		});
		expect(() => defineNoopCli(root)).toThrow(/expected exactly one bin entry, found 2/);
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
	const root = mkdtempSync(join(tmpdir(), "asdl-core-cli-entry-"));
	tempRoots.push(root);
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "cli.ts"), "#!/usr/bin/env node\n");
	writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson)}\n`);
	return root;
}

function packageMetaUrl(root: string): string {
	return pathToFileURL(join(root, "src", "cli.ts")).href;
}
