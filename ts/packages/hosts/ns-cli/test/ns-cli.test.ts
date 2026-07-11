import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { commandSucceeded, formatCommandFailure, runCommand } from "@nseng-ai/foundation/exec";

import { runNsCli } from "../src/cli/index.ts";
import {
	createEmptyProject,
	dataFromEnvelope,
	parseJsonOutput,
	runNsCliJson,
	writeModuleExtension,
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

async function initializeGitRepo(projectRoot: string): Promise<void> {
	const result = await runCommand("git", ["init"], { cwd: projectRoot });
	if (!commandSucceeded(result)) {
		throw new Error(formatCommandFailure("git init failed", "git init", result));
	}
}

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
		expect(exit).toBe(0);
		expect(help).toContain("Built-ins:");
		expect(help).toContain("  shell");
		expect(help).toContain("  completion");
		expect(help).toContain("  init");
		expect(help).toContain("  update");
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

	test("merges extension install with kernel point commands and exposes no top-level alias", async () => {
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
		expect(stdout.join("")).toContain("  point");
		expect(stdout.join("")).toContain("  points");
		expect(stderr.join("")).toBe("");

		const alias = await runNsCliJson(["install", "./extension"], cwd);
		expect(alias.exit).toBe(2);
		expect(alias.stderr).toContain("unknown command 'install'");
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
		const expectedRoot = join(cwd, ".claude-user", "skills");
		const run = await runNsCliJson(
			["skills", "path", "objective", "--harness", "claude", "--scope", "user"],
			cwd,
		);
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
		expect(stdout.join("")).toContain("Run ns self-update or update extension harness artifacts");
		expect(stdout.join("")).toContain("--extensions");
		expect(stdout.join("")).toContain("-n");
		expect(stdout.join("")).toContain("-f");
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
		expect(envelope.message).toContain("ns update --extensions");
	});

	test("updates module and first-party artifacts from a git-root subdirectory", async () => {
		const projectRoot = await createEmptyProject();
		await initializeGitRepo(projectRoot);
		await mkdir(join(projectRoot, "nested"), { recursive: true });
		await writeFile(
			join(projectRoot, "ns.toml"),
			'harnesses = ["pi"]\nextensions = ["./extensions/acme-module"]\n',
			"utf8",
		);
		await writeModuleExtension(projectRoot);
		const cwd = join(projectRoot, "nested");

		const installed = await runNsCliJson(["update", "--extensions"], cwd);
		const installedData = dataFromEnvelope(parseJsonOutput(installed));
		const moduleTarget = join(projectRoot, ".pi", "skills", "module-skill", "SKILL.md");
		const objectiveTarget = join(projectRoot, ".pi", "skills", "objective", "SKILL.md");
		const manifestPath = join(projectRoot, ".pi", "skills", ".ns-harness-artifacts-manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

		expect(installed.exit).toBe(0);
		expect(installedData).toMatchObject({ mode: "applied", isForceRequired: false });
		expect(installedData.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "installed" }),
				expect.objectContaining({ skillName: "objective", action: "installed" }),
			]),
		);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill\n");
		expect(await readFile(objectiveTarget, "utf8")).toContain("# objective");
		expect(manifest).toMatchObject({
			version: 1,
			artifacts: {
				"pi:project:skill:@acme/module:module-skill": {
					artifactId: "@acme/module:module-skill",
					provisionName: "module-skill",
				},
				"pi:project:skill:objective-skill": {
					artifactId: "objective-skill",
					provisionName: "objective",
				},
			},
		});

		const rerun = await runNsCliJson(["update", "--extensions"], cwd);
		const rerunData = dataFromEnvelope(parseJsonOutput(rerun));
		expect(rerun.exit).toBe(0);
		expect(rerunData.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "unchanged" }),
				expect.objectContaining({ skillName: "objective", action: "unchanged" }),
			]),
		);

		await writeFile(objectiveTarget, "local edit\n", "utf8");
		await writeFile(
			join(projectRoot, "extensions", "acme-module", "skills", "module-skill", "SKILL.md"),
			"# module skill v2\n",
			"utf8",
		);
		const refused = await runNsCliJson(["update", "--extensions"], cwd);
		const refusedEnvelope = parseJsonOutput(refused);
		expect(refused.exit).toBe(1);
		expect(refusedEnvelope).toMatchObject({ status: "negative", exitCode: 1 });
		expect(dataFromEnvelope(refusedEnvelope)).toMatchObject({
			mode: "dry-run",
			isForceRequired: true,
		});
		expect(dataFromEnvelope(refusedEnvelope).artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ skillName: "module-skill", action: "refreshed" }),
				expect.objectContaining({ skillName: "objective", action: "conflicted" }),
			]),
		);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill\n");
		expect(await readFile(objectiveTarget, "utf8")).toBe("local edit\n");

		const forced = await runNsCliJson(["update", "--extensions", "--force"], cwd);
		expect(forced.exit).toBe(0);
		expect(await readFile(moduleTarget, "utf8")).toBe("# module skill v2\n");
		expect(await readFile(objectiveTarget, "utf8")).toContain("# objective");
	});
});
