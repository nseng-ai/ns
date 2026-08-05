import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCliWithFakes, type RunWithFakesOptions } from "../scenario/ns-cli-fakes.ts";

const tempDirs: string[] = [];
const require = createRequire(import.meta.url);
const sdkEntry = require.resolve("@nseng-ai/sdk");

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
		const cwd = await createDescriptorExtensionProject(
			"hello",
			`import { defineCommand, ok, z } from ${JSON.stringify(sdkEntry)};
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({ loud: z.boolean().default(false).describe("Use loud output.") }),
		handler: async () => ok("hello"),
	});
}
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

	test("unrelated broken extension command is not imported for selected valid command completion", async () => {
		const cwd = await createDescriptorExtensionProject(
			"hello",
			`import { defineCommand, ok, z } from ${JSON.stringify(sdkEntry)};
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({ loud: z.boolean().default(false) }),
		handler: async () => ok("hello"),
	});
}
`,
		);
		writeDescriptorCommand(cwd, "bad", "throw new Error('unrelated import boom');\n");
		writeDescriptorPackage(cwd);
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--loud\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("selected dynamic completion provider runs through the real extension loader", async () => {
		const cwd = await createDescriptorExtensionProject(
			"hello",
			`import { defineCommand, ok, z } from ${JSON.stringify(sdkEntry)};
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({ name: z.string().optional() }),
		positionals: { name: { position: 0 } },
		completionProvider(_ctx, request) {
			return ["alpha", "beta"].filter((value) => value.startsWith(request.current)).map((value) => ({ value, type: "positional-value" }));
		},
		handler: async () => ok("hello"),
	});
}
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
		const cwd = await createDescriptorExtensionProject(
			"hello",
			"throw new Error('selected boom');\n",
		);
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			cwd,
		});

		await expect(run.exit).rejects.toThrow("selected boom");
		expect(run.stdout.join("")).toBe("");
	});
});

async function createDescriptorExtensionProject(
	commandName: string,
	source: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-completion-integration-"));
	tempDirs.push(directory);
	writeDescriptorPackage(directory);
	writeDescriptorCommand(directory, commandName, source);
	return directory;
}

function writeDescriptorPackage(cwd: string): void {
	writeFileSyncWithParents(join(cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "package.json"),
		JSON.stringify({
			name: "tools",
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		}),
	);
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
	description: "Project test tools.",
	commandDirectory: \`${"${import.meta.dirname}"}/cli\`,
});
`,
	);
}

function writeDescriptorCommand(cwd: string, commandName: string, source: string): void {
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "src", "ns", "cli", commandName, "metadata.ts"),
		'export function metadata() { return { description: "Hello" }; }\n',
	);
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "src", "ns", "cli", commandName, "command.ts"),
		source,
	);
}

function writeFileSyncWithParents(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}
