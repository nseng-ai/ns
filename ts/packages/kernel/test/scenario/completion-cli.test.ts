import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "@sdl/kernel/cli";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl completion CLI", () => {
	test("prints dynamic setup scripts for supported shells", async () => {
		for (const shell of ["bash", "zsh", "fish"] as const) {
			const run = runScenario(["completion", shell]);

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("'sdl' 'completion' 'exec' 'resolve'");
			expect(run.stderr.join("")).toBe("");
		}
	});

	test("script generation is quiet with unrelated broken extensions", async () => {
		const cwd = await createExtensionProject(
			"bad.ts",
			"throw new Error('script should not import');\n",
		);
		const run = runScenario(["completion", "bash"], { cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("'sdl' 'completion' 'exec' 'resolve'");
		expect(run.stderr.join("")).toBe("");
	});

	test("hidden resolver returns top-level candidates as newline values only", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok } from "sdl-sdk";
export default defineExtension({
	commands: [{ name: "hello", summary: "Hello", description: "Hello", run() { return ok("hello"); } }],
});
`,
		);
		const run = runScenario(["completion", "exec", "resolve", "--", ""], { cwd });

		expect(await run.exit).toBe(0);
		const values = run.stdout
			.join("")
			.split("\n")
			.filter((value) => value !== "");
		expect(values).toContain("completion");
		expect(values).toContain("hello");
		expect(run.stdout.join("")).not.toContain("Hello");
		expect(run.stderr.join("")).toBe("");
	});

	test("selected command option completion imports only the selected command", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "sdl-sdk";
export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({ loud: z.boolean().default(false).describe("Use loud output.") }),
		run() { return ok("hello"); },
	}],
});
`,
		);
		writeProjectExtension(cwd, "bad.ts", "throw new Error('unrelated import boom');\n");
		const run = runScenario(["completion", "exec", "resolve", "--", "hello", "--"], { cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--loud\n");
		expect(run.stdout.join("")).not.toContain("unrelated");
		expect(run.stderr.join("")).toBe("");
	});

	test("selected broken command reports on stderr without candidate stdout", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('selected boom');\n");
		const run = runScenario(["completion", "exec", "resolve", "--", "hello", "--"], { cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("selected boom");
	});

	test("selected command dynamic provider returns candidates and keeps static options", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "sdl-sdk";
export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({ name: z.string().optional(), loud: z.boolean().default(false) }),
		positionals: { name: { position: 0 } },
		completionProvider(_ctx, request) {
			return ["alpha", "beta"].filter((value) => value.startsWith(request.current)).map((value) => ({ value, type: "positional-value" }));
		},
		run() { return ok("hello"); },
	}],
});
`,
		);
		writeProjectExtension(cwd, "bad.ts", "throw new Error('unrelated import boom');\n");

		const dynamicRun = runScenario(["completion", "exec", "resolve", "--", "hello", "a"], {
			cwd,
		});
		expect(await dynamicRun.exit).toBe(0);
		expect(dynamicRun.stdout.join("")).toBe("alpha\n");
		expect(dynamicRun.stderr.join("")).toBe("");

		const optionRun = runScenario(["completion", "exec", "resolve", "--", "hello", "--"], {
			cwd,
		});
		expect(await optionRun.exit).toBe(0);
		expect(optionRun.stdout.join("")).toContain("--loud\n");
		expect(optionRun.stderr.join("")).toBe("");
	});

	test("selected command dynamic provider failure preserves static candidates", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "sdl-sdk";
export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({ mode: z.enum(["fast", "slow"]).optional() }),
		positionals: { mode: { position: 0 } },
		completionProvider() { throw new Error("provider boom"); },
		run() { return ok("hello"); },
	}],
});
`,
		);
		const run = runScenario(["completion", "exec", "resolve", "--", "hello", "f"], { cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("fast\n");
		expect(run.stderr.join("")).toContain("provider boom");
	});

	test("hidden resolver is omitted from completion help", async () => {
		const run = runScenario(["completion", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("bash");
		expect(run.stdout.join("")).not.toContain("resolve");
	});
});

function runScenario(
	args: readonly string[],
	options: { cwd?: string | undefined } = {},
): { exit: Promise<number>; stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? process.cwd();
	return {
		exit: runCli(args, {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { ...process.env, HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

async function createExtensionProject(fileName: string, source: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-completion-project-"));
	tempDirs.push(directory);
	writeProjectExtension(directory, fileName, source);
	return directory;
}

function writeProjectExtension(cwd: string, fileName: string, source: string): void {
	const path = join(cwd, ".sdl", "extensions", fileName);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}
