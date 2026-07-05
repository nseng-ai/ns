import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCliWithFakes, type RunWithFakesOptions } from "../scenario/ns-cli-fakes.ts";

const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("ns completion CLI extension loader integration", () => {
	test("project extension command schema is importable for selected option completion", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "@nseng-ai/kernel/sdk";
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
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--loud\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("unrelated broken extension is not imported for selected valid command completion", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "@nseng-ai/kernel/sdk";
export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({ loud: z.boolean().default(false) }),
		run() { return ok("hello"); },
	}],
});
`,
		);
		writeProjectExtension(cwd, "bad.ts", "throw new Error('unrelated import boom');\n");
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--loud\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("selected dynamic completion provider runs through the real extension loader", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`import { defineExtension, ok, z } from "@nseng-ai/kernel/sdk";
export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({ name: z.string().optional() }),
		positionals: { name: { position: 0 } },
		completionProvider(_ctx, request) {
			return ["alpha", "beta"].filter((value) => value.startsWith(request.current)).map((value) => ({ value, type: "positional-value" }));
		},
		run() { return ok("hello"); },
	}],
});
`,
		);
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "a"],
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("alpha\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("selected load failure reports diagnostics without candidate stdout", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('selected boom');\n");
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("selected boom");
	});
});

async function createExtensionProject(fileName: string, source: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-completion-integration-"));
	tempDirs.push(directory);
	writeProjectExtension(directory, fileName, source);
	return directory;
}

function writeProjectExtension(cwd: string, fileName: string, source: string): void {
	const path = join(cwd, ".ns", "extensions", fileName);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}
