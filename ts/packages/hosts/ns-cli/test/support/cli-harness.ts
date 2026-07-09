import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

import { runNsCli } from "../../src/cli.ts";

const tempDirs: string[] = [];

export interface NsCliJsonRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

export async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return directory;
}

export async function writeModuleExtension(projectRoot: string): Promise<void> {
	const moduleRoot = join(projectRoot, "extensions", "acme-module");
	await mkdir(join(moduleRoot, "skills", "module-skill"), { recursive: true });
	await mkdir(join(moduleRoot, "src", "ns"), { recursive: true });
	await writeFile(
		join(moduleRoot, "package.json"),
		`${JSON.stringify(
			{
				name: "@acme/module",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	await writeFile(
		join(moduleRoot, "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/kernel/sdk";
export default defineExtension({
	description: "ACME module.",
	bundledArtifacts: [{ kind: "skill", name: "module-skill", path: "skills/module-skill" }],
});
`,
		"utf8",
	);
	await writeFile(
		join(moduleRoot, "skills", "module-skill", "SKILL.md"),
		"# module skill\n",
		"utf8",
	);
}

export async function runNsCliJson(args: readonly string[], cwd: string): Promise<NsCliJsonRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const homeDir = join(cwd, ".home");
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd,
		homeDir,
		env: { HOME: homeDir, CLAUDE_CONFIG_DIR: join(cwd, ".claude-user") },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}

export function parseJsonOutput(run: { readonly stdout: string }): Record<string, unknown> {
	const parsed: unknown = JSON.parse(run.stdout);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected JSON object output.");
	}
	return parsed as Record<string, unknown>;
}

export function dataFromEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
	const data = envelope.data;
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected envelope data object.");
	}
	return data as Record<string, unknown>;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});
