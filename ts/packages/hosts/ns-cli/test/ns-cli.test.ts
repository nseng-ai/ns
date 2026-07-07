import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { runNsCli } from "../src/cli.ts";

const tempDirs: string[] = [];
const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const tsRoot = resolve(packageRoot, "../../..");

async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return directory;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function runNsCliJson(args: readonly string[], cwd: string) {
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

function parseJsonOutput(run: { stdout: string }): Record<string, unknown> {
	const parsed: unknown = JSON.parse(run.stdout);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected JSON object output.");
	}
	return parsed as Record<string, unknown>;
}

function dataFromEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
	const data = envelope.data;
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected envelope data object.");
	}
	return data as Record<string, unknown>;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

interface KernelExportSurface {
	readonly name: string;
	readonly host: string;
	readonly kernel: string;
}

async function kernelExportSurfaces(): Promise<readonly KernelExportSurface[]> {
	const content = await readFile(
		resolve(packageRoot, "scripts/kernel-export-entries.json"),
		"utf8",
	);
	const parsed: unknown = JSON.parse(content);
	if (!isRecord(parsed)) {
		throw new Error("Expected kernel export entries to be an object.");
	}
	return Object.entries(parsed).map(([entry, spec]) => {
		if (!isRecord(spec)) {
			throw new Error(`Expected kernel export entry ${entry} to be an object.`);
		}
		const { host, kernel } = spec;
		if (typeof host !== "string" || typeof kernel !== "string") {
			throw new Error(`Expected kernel export entry ${entry} to declare host and kernel paths.`);
		}
		return { name: entry.replace(/^kernel\//, ""), host, kernel };
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exportedNames(path: string): Promise<readonly string[]> {
	const content = await readFile(path, "utf8");
	return [...declaredExportNames(content), ...namedReExportNames(content)].sort();
}

function declaredExportNames(content: string): string[] {
	return [
		...content.matchAll(
			/export\s+(?:async\s+)?(?:class|function|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
		),
	].map((match) => match[1] ?? "");
}

function namedReExportNames(content: string): string[] {
	return [
		...content.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/g),
	].flatMap((match) => exportListNames(match[1] ?? ""));
}

function exportListNames(list: string): string[] {
	return list
		.replaceAll(/\/\*[\s\S]*?\*\//g, "")
		.split(",")
		.map((entry) => entry.replaceAll(/\/\/.*$/g, "").trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => entry.replace(/^type\s+/, "").split(/\s+as\s+/)[1] ?? entry);
}

describe("ns CLI host", () => {
	test("keeps checkout-free kernel barrels exhaustive with kernel export surfaces", async () => {
		for (const surface of await kernelExportSurfaces()) {
			const hostExports = await exportedNames(resolve(packageRoot, surface.host));
			const kernelExports = await exportedNames(resolve(tsRoot, "packages", surface.kernel));
			expect(hostExports, `${surface.name} host exports`).toEqual(kernelExports);
		}
	});

	test("injects Objective preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["objective", "list", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("Usage: ns objective list");
		expect(stdout.join("")).toContain("List Objective records in the current checkout.");
		expect(stderr.join("")).toBe("");
	});

	test("injects ns init preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["init", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("Usage: ns init");
		expect(stdout.join("")).toContain(
			"Activate ns Objectives in this repository by writing ns.toml",
		);
		expect(stderr.join("")).toBe("");
	});

	test("lists first-party ns skills", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["skills", "list"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("ns first-party skills");
		expect(stdout.join("")).toContain("objective (objective-skill)");
		expect(stderr.join("")).toBe("");
	});

	test("resolves skill paths for harness aliases and both scopes", async () => {
		const cwd = await createEmptyProject();
		const homeDir = join(cwd, ".home");
		const cases = [
			{
				harness: "claude",
				scope: "user",
				expectedHarness: "claude-code",
				expectedRoot: join(cwd, ".claude-user", "skills"),
			},
			{
				harness: "claude-code",
				scope: "project",
				expectedHarness: "claude-code",
				expectedRoot: join(cwd, ".claude", "skills"),
			},
			{
				harness: "codex",
				scope: "user",
				expectedHarness: "codex",
				expectedRoot: join(homeDir, ".agents", "skills"),
			},
			{
				harness: "codex",
				scope: "project",
				expectedHarness: "codex",
				expectedRoot: join(cwd, ".agents", "skills"),
			},
			{
				harness: "pi-dev",
				scope: "user",
				expectedHarness: "pi",
				expectedRoot: join(homeDir, ".pi", "agent", "skills"),
			},
			{
				harness: "pi",
				scope: "project",
				expectedHarness: "pi",
				expectedRoot: join(cwd, ".pi", "skills"),
			},
		] as const;

		for (const testCase of cases) {
			const run = await runNsCliJson(
				["skills", "path", "objective", "--harness", testCase.harness, "--scope", testCase.scope],
				cwd,
			);
			const data = dataFromEnvelope(parseJsonOutput(run));

			expect(run.exit).toBe(0);
			expect(data).toMatchObject({
				skill: "objective",
				artifactId: "objective-skill",
				harness: testCase.expectedHarness,
				scope: testCase.scope,
				targetRoot: testCase.expectedRoot,
				targetArtifactPath: join(testCase.expectedRoot, "objective"),
			});
			expect(run.stderr).toBe("");
		}
	});

	test("previews skill install without writing target files or manifest", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(
			["skills", "install", "objective", "--harness", "pi", "--scope", "project", "--dry-run"],
			cwd,
		);
		const data = dataFromEnvelope(parseJsonOutput(run));
		const targetPath = join(cwd, ".pi", "skills", "objective", "SKILL.md");
		const manifestPath = join(cwd, ".pi", "skills", ".ns-harness-artifacts-manifest.json");

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({ mode: "dry-run", skill: "objective", writtenFiles: [] });
		expect(await pathExists(targetPath)).toBe(false);
		expect(await pathExists(manifestPath)).toBe(false);
		expect(run.stderr).toBe("");
	});

	test("installs a skill into a temp project target and writes the manifest", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const data = dataFromEnvelope(parseJsonOutput(run));
		const targetPath = join(cwd, ".agents", "skills", "objective", "SKILL.md");
		const manifestPath = join(cwd, ".agents", "skills", ".ns-harness-artifacts-manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({ mode: "applied", skill: "objective", manifestPath });
		expect(await readFile(targetPath, "utf8")).toContain("# objective");
		expect(manifest).toMatchObject({
			version: 1,
			artifacts: {
				"codex:project:skill:objective-skill": {
					artifactId: "objective-skill",
					provisionName: "objective",
				},
			},
		});
		expect(run.stderr).toBe("");
	});

	test("refuses to overwrite a locally edited installed skill without force", async () => {
		const cwd = await createEmptyProject();
		const install = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const targetPath = join(cwd, ".agents", "skills", "objective", "SKILL.md");
		await writeFile(targetPath, "local edit\n", "utf8");

		const refused = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const envelope = parseJsonOutput(refused);

		expect(install.exit).toBe(0);
		expect(refused.exit).toBe(1);
		expect(envelope).toMatchObject({ status: "negative", exitCode: 1 });
		expect(dataFromEnvelope(envelope)).toMatchObject({ conflictingFiles: [targetPath] });
		expect(await readFile(targetPath, "utf8")).toBe("local edit\n");
	});
});
