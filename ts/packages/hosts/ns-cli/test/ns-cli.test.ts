import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
