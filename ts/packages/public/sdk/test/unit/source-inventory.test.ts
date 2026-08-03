import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadNsCommandSourceInventory } from "../../src/extensions/source-inventory.ts";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("ns command source inventory", () => {
	test("preserves stable unique labels, source kinds, acquisition origins, and package facts", async () => {
		const project = await createProject();
		writeLocalDescriptor(project, "tools", {
			description: "Local tools.",
			commandDirectory: path.join(project, "extensions", "tools", "commands"),
		});
		writeFileSync(path.join(project, "ns.toml"), 'extensions = ["./extensions/tools"]\n');

		const inventory = await loadNsCommandSourceInventory({
			cwd: project,
			preinstalledSources: () => [
				{
					label: "host:built-in",
					kind: "built-in",
					origin: "host",
					helpClassification: "built-in",
					package: { name: "@example/host", version: "1.0.0", descriptorPath: "host" },
				},
				{
					label: "package:preinstalled",
					kind: "preinstalled",
					origin: "package",
					helpClassification: "extension",
					package: {
						name: "@example/preinstalled",
						version: "2.0.0",
						descriptorPath: "package",
					},
				},
			],
		});

		expect(inventory.sources.map(({ label }) => label)).toEqual([
			"host:built-in",
			"package:preinstalled",
			"project:tools",
		]);
		expect(new Set(inventory.sources.map(({ label }) => label)).size).toBe(
			inventory.sources.length,
		);
		expect(inventory.sources.map(({ kind, origin }) => ({ kind, origin }))).toEqual([
			{ kind: "built-in", origin: "host" },
			{ kind: "preinstalled", origin: "package" },
			{ kind: "project", origin: "local" },
		]);
		expect(inventory.extensionPackageNames).toEqual(
			new Set(["@example/host", "@example/preinstalled", "tools"]),
		);
		expect(inventory.builtInPackageNames).toEqual(new Set(["@example/host"]));
	});

	test("keeps commandless descriptor package presence in inventory", async () => {
		const project = await createProject();
		writeLocalDescriptor(project, "metadata", { description: "Metadata only." });
		writeFileSync(path.join(project, "ns.toml"), 'extensions = ["./extensions/metadata"]\n');

		const inventory = await loadNsCommandSourceInventory({ cwd: project });
		expect(inventory.sources).toMatchObject([
			{
				label: "project:metadata",
				kind: "project",
				origin: "local",
				helpClassification: "extension",
				package: { name: "metadata", version: "1.0.0" },
			},
		]);
		expect(inventory.sources[0]).not.toHaveProperty("commandDirectory");
		expect(inventory.extensionPackageNames.has("metadata")).toBe(true);
	});

	test("reports source diagnostics without inventing sources", async () => {
		const project = await createProject();
		writeFileSync(path.join(project, "ns.toml"), "extensions = [42]\n");
		const inventory = await loadNsCommandSourceInventory({ cwd: project });
		expect(inventory.sources).toEqual([]);
		expect(inventory.diagnostics).toMatchObject([
			{ severity: "error", code: expect.any(String), path: path.join(project, "ns.toml") },
		]);
	});
});

async function createProject(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "ns-source-inventory-"));
	tempDirectories.push(directory);
	return directory;
}

function writeLocalDescriptor(
	project: string,
	packageName: string,
	descriptor: Record<string, unknown>,
): void {
	const root = path.join(project, "extensions", packageName);
	mkdirSync(path.join(root, "src"), { recursive: true });
	writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeFileSync(
		path.join(root, "src", "ns-extension.ts"),
		`export default ${JSON.stringify(descriptor)};\n`,
	);
}
