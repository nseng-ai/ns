import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runNsCli } from "../src/cli/index.ts";
import {
	createEmptyProject,
	dataFromEnvelope,
	parseJsonOutput,
	runNsCliJson,
} from "./support/cli-harness.ts";

const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const tsRoot = resolve(packageRoot, "../../..");

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

interface SdkExportSurface {
	readonly name: string;
	readonly host: string;
	readonly sdk: string;
}

async function sdkExportSurfaces(): Promise<readonly SdkExportSurface[]> {
	const content = await readFile(resolve(packageRoot, "scripts/sdk-export-entries.json"), "utf8");
	const parsed: unknown = JSON.parse(content);
	if (!isRecord(parsed)) {
		throw new Error("Expected sdk export entries to be an object.");
	}
	return Object.entries(parsed).map(([entry, spec]) => {
		if (!isRecord(spec)) {
			throw new Error(`Expected sdk export entry ${entry} to be an object.`);
		}
		const { host, sdk } = spec;
		if (typeof host !== "string" || typeof sdk !== "string") {
			throw new Error(`Expected sdk export entry ${entry} to declare host and sdk paths.`);
		}
		return { name: entry.replace(/^sdk\//, ""), host, sdk };
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function helpSection(help: string, heading: string): string {
	const start = help.indexOf(`${heading}\n`);
	if (start === -1) return "";
	const sectionStart = start + heading.length + 1;
	const nextHeading = help.slice(sectionStart).search(/^\S[^\n]*:\n/m);
	return nextHeading === -1
		? help.slice(sectionStart)
		: help.slice(sectionStart, sectionStart + nextHeading);
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
	test("keeps checkout-free sdk barrels exhaustive with sdk export surfaces", async () => {
		for (const surface of await sdkExportSurfaces()) {
			const hostExports = await exportedNames(resolve(packageRoot, surface.host));
			const sdkExports = await exportedNames(resolve(tsRoot, "packages", surface.sdk));
			expect(hostExports, `${surface.name} host exports`).toEqual(sdkExports);
		}
	});

	test("does not inject Objective preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).not.toContain("objective");
		expect(stdout.join("")).not.toContain("Usage: ns objective list");
		expect(stderr.join("")).toBe("");
	});

	test("groups root built-in commands together in top-level help", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		const help = stdout.join("");
		const builtIns = helpSection(help, "Built-ins:");
		expect(exit).toBe(0);
		for (const command of ["init", "update", "shell", "completion", "extension", "skills"]) {
			expect(builtIns).toMatch(new RegExp(`^  ${command}(?:\\s|$)`, "m"));
		}
		expect(help).not.toContain("Extensions:");
		expect(help).not.toContain("\nCommands:\n");
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
		expect(stdout.join("")).toContain("Activate ns in this repository by writing ns.toml");
		expect(stderr.join("")).toBe("");
	});

	test("merges extension lifecycle commands with SDK point commands and exposes no aliases", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["extension", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("  install");
		expect(stdout.join("")).toContain("  list");
		expect(stdout.join("")).toContain("  uninstall");
		expect(stdout.join("")).toContain("  point");
		expect(stdout.join("")).toContain("  points");
		expect(stderr.join("")).toBe("");

		for (const args of [
			["install", "./extension"],
			["uninstall", "./extension"],
			["remove", "./extension"],
			["extension", "remove", "./extension"],
		]) {
			const alias = await runNsCliJson(args, cwd);
			expect(alias.exit).toBe(2);
			expect(alias.stderr).toContain("unknown command");
		}
	});

	test("publishes extension install help, schema, usage, and failure contracts", async () => {
		const cwd = await createEmptyProject();

		const helpStdout: string[] = [];
		const helpExit = await runNsCli(["extension", "install", "-h"], {
			cwd,
			stdout: (text) => helpStdout.push(text),
			stderr: () => undefined,
		});
		expect(helpExit).toBe(0);
		expect(helpStdout.join("")).toContain("Usage: ns extension install [options] <source>");
		expect(helpStdout.join("")).not.toContain("--harness");
		expect(helpStdout.join("")).not.toContain("--yes");
		expect(helpStdout.join("")).not.toContain("--force");

		const schemaStdout: string[] = [];
		const schemaExit = await runNsCli(["extension", "install", "--json-schema"], {
			cwd,
			stdout: (text) => schemaStdout.push(text),
			stderr: () => undefined,
		});
		expect(schemaExit).toBe(0);
		const schema = JSON.parse(schemaStdout.join("")) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaStdout.join("")).toContain("sourceSpec");
		expect(schemaStdout.join("")).toContain("completed");

		const usage = await runNsCliJson(["extension", "install"], cwd);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
	});

	test("publishes extension list help, schema, and failure contracts", async () => {
		const cwd = await createEmptyProject();
		const helpStdout: string[] = [];
		const helpExit = await runNsCli(["extension", "list", "-h"], {
			cwd,
			stdout: (text) => helpStdout.push(text),
			stderr: () => undefined,
		});
		expect(helpExit).toBe(0);
		const help = helpStdout.join("");
		expect(help).toContain("Usage: ns extension list|ls [options]");
		expect(help).toContain("without\nacquiring packages or changing files");
		expect(help).not.toContain("--yes");
		expect(help).not.toContain("--force");

		const schemaStdout: string[] = [];
		const schemaExit = await runNsCli(["extension", "list", "--json-schema"], {
			cwd,
			stdout: (text) => schemaStdout.push(text),
			stderr: () => undefined,
		});
		expect(schemaExit).toBe(0);
		const schema = JSON.parse(schemaStdout.join("")) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaStdout.join("")).toContain("sourceSpec");
		expect(schemaStdout.join("")).toContain("acquisitionStatus");
		expect(schemaStdout.join("")).toContain("affectedArtifactCount");

		const failed = await runNsCliJson(["extension", "list"], cwd);
		expect(failed.exit).toBe(2);
		expect(parseJsonOutput(failed)).toMatchObject({
			status: "failure",
			errorType: "ns-extension-list-not-a-git-repo",
			data: { diagnostics: [{ code: "not-a-git-repo" }] },
		});

		const usage = await runNsCliJson(["extension", "list", "unexpected"], cwd);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
	});

	test("publishes extension uninstall help, schema, usage, and failure contracts", async () => {
		const cwd = await createEmptyProject();
		const helpStdout: string[] = [];
		const helpExit = await runNsCli(["extension", "uninstall", "-h"], {
			cwd,
			stdout: (text) => helpStdout.push(text),
			stderr: () => undefined,
		});
		expect(helpExit).toBe(0);
		const help = helpStdout.join("");
		expect(help).toContain("Usage: ns extension uninstall [options] <source>");
		expect(help).not.toContain("--harness");
		expect(help).not.toContain("--yes");
		expect(help).not.toContain("--force");

		const schemaStdout: string[] = [];
		const schemaExit = await runNsCli(["extension", "uninstall", "--json-schema"], {
			cwd,
			stdout: (text) => schemaStdout.push(text),
			stderr: () => undefined,
		});
		expect(schemaExit).toBe(0);
		const schema = JSON.parse(schemaStdout.join("")) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaStdout.join("")).toContain("sourceIdentity");
		expect(schemaStdout.join("")).toContain("cleanup");

		const usage = await runNsCliJson(["extension", "uninstall"], cwd);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({ status: "usageError", errorType: "usageError" });

		const failed = await runNsCliJson(["extension", "uninstall", "./extension"], cwd);
		expect(failed.exit).toBe(2);
		expect(parseJsonOutput(failed)).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-not-a-git-repo",
			data: { phase: "preflight", completed: {} },
		});
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

	test("smokes skills path host wiring for an alias user-scope case", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(
			["skills", "path", "objective", "--harness", "claude", "--scope", "user"],
			cwd,
		);
		const expectedRoot = join(run.claudeConfigDir, "skills");
		const data = dataFromEnvelope(parseJsonOutput(run));

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({
			skill: "objective",
			artifactId: "objective-skill",
			harness: "claude-code",
			scope: "user",
			targetRoot: expectedRoot,
			targetArtifactPath: join(expectedRoot, "objective"),
		});
		expect(run.stderr).toBe("");
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

	test("injects ns update preinstalled command metadata", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exit = await runNsCli(["update", "--help"], {
			cwd,
			homeDir: join(cwd, ".home"),
			env: { HOME: join(cwd, ".home") },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exit).toBe(0);
		expect(stdout.join("")).toContain("Usage: ns update");
		expect(stdout.join("")).toContain("Reserved ns self-update surface");
		expect(stdout.join("")).not.toContain("--extensions");
		expect(stdout.join("")).not.toContain("--all");
		expect(stdout.join("")).not.toContain("--force");
		expect(stderr.join("")).toBe("");
	});

	test("bare ns update reports self-update not implemented", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(["update"], cwd);
		const envelope = parseJsonOutput(run);

		expect(run.exit).toBe(2);
		expect(envelope).toMatchObject({
			status: "failure",
			errorType: "self-update-not-implemented",
		});
		expect(envelope.message).toContain("ns extension update <source>");
	});

	test("rejects the retired top-level extension update flags", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(["update", "--extensions"], cwd);
		expect(run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ status: "usageError", exitCode: 2 });
	});
});
