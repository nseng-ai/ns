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

	test("Built-in and explicit Project packages block same-name source-dev packages", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		writeWorkspaceDescriptor(
			packagesRoot,
			"incubating/extensions/built-in-copy",
			"@example/built-in",
		);
		writeWorkspaceDescriptor(
			packagesRoot,
			"incubating/extensions/project-copy",
			"@example/project",
		);
		writeDescriptorPackage(path.join(checkout, "extensions", "project"), "@example/project", {
			description: "Explicit project owner.",
		});
		writeFileSync(path.join(checkout, "ns.toml"), 'extensions = ["./extensions/project"]\n');

		const inventory = await loadNsCommandSourceInventory({
			cwd: checkout,
			sourceDevPackagesRoot: packagesRoot,
			preinstalledSources: () => [commandSource("host:built-in", "built-in", "@example/built-in")],
		});

		expect(inventory.sources.map(({ label }) => label)).toEqual([
			"host:built-in",
			"project:@example/project",
		]);
		expect(inventory.extensionPackageNames).toEqual(
			new Set(["@example/built-in", "@example/project"]),
		);
		expect(inventory.builtInPackageNames).toEqual(new Set(["@example/built-in"]));
	});

	test("source-dev command packages suppress matching User and ordinary Preinstalled packages", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		const homeDir = path.join(checkout, "home");
		const sourceDevOwnerRoot = path.join(packagesRoot, "incubating/extensions/owner");
		writeDescriptorPackage(sourceDevOwnerRoot, "@example/shared", {
			description: "Workspace extension.",
			commandDirectory: path.join(sourceDevOwnerRoot, "commands"),
		});
		writeWorkspaceDescriptor(packagesRoot, "incubating/extensions/metadata", "@example/metadata");
		const userShared = writeUserDescriptor(homeDir, "shared", "@example/shared");
		const userMetadata = path.join(homeDir, "extensions", "metadata");
		writeDescriptorPackage(userMetadata, "@example/metadata", {
			description: "User extension with commands.",
			commandDirectory: path.join(userMetadata, "commands"),
		});
		const userOther = writeUserDescriptor(homeDir, "other", "@example/user-other");
		writeLocalDescriptor(checkout, "project-other", { description: "Unrelated Project owner." });
		mkdirSync(path.join(homeDir, ".config", "ns"), { recursive: true });
		writeFileSync(
			path.join(homeDir, ".config", "ns", "ns.toml"),
			`extensions = [${JSON.stringify(userShared)}, ${JSON.stringify(userMetadata)}, ${JSON.stringify(userOther)}]\n`,
		);
		writeFileSync(path.join(checkout, "ns.toml"), 'extensions = ["./extensions/project-other"]\n');

		const inventory = await loadNsCommandSourceInventory({
			cwd: checkout,
			homeDir,
			env: { HOME: homeDir },
			sourceDevPackagesRoot: packagesRoot,
			preinstalledSources: () => [
				commandSource("host:other", "built-in", "@example/built-in-other"),
				commandSource("package:shared", "preinstalled", "@example/shared"),
				{
					...commandSource("package:metadata", "preinstalled", "@example/metadata"),
					commandDirectory: path.join(checkout, "preinstalled-metadata-commands"),
				},
				commandSource("package:other", "preinstalled", "@example/preinstalled-other"),
				{
					label: "package:without-facts",
					kind: "preinstalled",
					origin: "package",
					helpClassification: "extension",
				},
			],
		});

		expect(inventory.sources.map(({ label }) => label)).toEqual([
			"host:other",
			"package:metadata",
			"package:other",
			"package:without-facts",
			`source-dev:${path.join("incubating", "extensions", "metadata")}`,
			`source-dev:${path.join("incubating", "extensions", "owner")}`,
			"user:@example/metadata",
			"user:@example/user-other",
			"project:project-other",
		]);
		expect(
			inventory.sources.filter((source) => source.package?.name === "@example/shared"),
		).toHaveLength(1);
		const metadataSources = inventory.sources.filter(
			(source) => source.package?.name === "@example/metadata",
		);
		expect(metadataSources).toHaveLength(3);
		expect(
			metadataSources.find((source) => source.label.startsWith("source-dev:")),
		).not.toHaveProperty("commandDirectory");
		expect(metadataSources.filter((source) => source.commandDirectory !== undefined)).toHaveLength(
			2,
		);
		expect(inventory.extensionPackageNames).toEqual(
			new Set([
				"@example/built-in-other",
				"@example/preinstalled-other",
				"@example/metadata",
				"@example/shared",
				"@example/user-other",
				"project-other",
			]),
		);
	});

	test("preserves direct Project-over-User normalized source-identity suppression", async () => {
		const project = await createProject();
		const homeDir = path.join(project, "home");
		writeLocalDescriptor(project, "shared", { description: "Shared declaration." });
		const sharedPackageRoot = path.join(project, "extensions", "shared");
		mkdirSync(path.join(homeDir, ".config", "ns"), { recursive: true });
		writeFileSync(
			path.join(homeDir, ".config", "ns", "ns.toml"),
			`extensions = [${JSON.stringify(sharedPackageRoot)}]\n`,
		);
		writeFileSync(path.join(project, "ns.toml"), 'extensions = ["./extensions/shared"]\n');

		const inventory = await loadNsCommandSourceInventory({
			cwd: project,
			homeDir,
			env: { HOME: homeDir },
		});

		expect(inventory.sources.map(({ label }) => label)).toEqual(["project:shared"]);
	});

	test("outside a recognized checkout leaves User and ordinary Preinstalled sources unchanged", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		writeWorkspaceDescriptor(packagesRoot, "incubating/extensions/copy", "@example/shared");
		const outside = await createProject();
		const homeDir = path.join(outside, "home");
		const userShared = writeUserDescriptor(homeDir, "shared", "@example/shared");
		mkdirSync(path.join(homeDir, ".config", "ns"), { recursive: true });
		writeFileSync(
			path.join(homeDir, ".config", "ns", "ns.toml"),
			`extensions = [${JSON.stringify(userShared)}]\n`,
		);

		const inventory = await loadNsCommandSourceInventory({
			cwd: outside,
			homeDir,
			env: { HOME: homeDir },
			sourceDevPackagesRoot: packagesRoot,
			preinstalledSources: () => [
				commandSource("package:shared", "preinstalled", "@example/shared"),
			],
		});

		expect(inventory.sources.map(({ label }) => label)).toEqual([
			"package:shared",
			"user:@example/shared",
		]);
	});

	test("reports source diagnostics without inventing sources", async () => {
		const project = await createProject();
		writeFileSync(path.join(project, "ns.toml"), "extensions = [42]\n");
		const inventory = await loadNsCommandSourceInventory({ cwd: project, homeDir: project });
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

async function createCheckout(): Promise<string> {
	const checkout = await createProject();
	mkdirSync(path.join(checkout, "ts", "packages", "public", "sdk", "src"), { recursive: true });
	return checkout;
}

function commandSource(label: string, kind: "built-in" | "preinstalled", packageName: string) {
	return {
		label,
		kind,
		origin: "package" as const,
		helpClassification: kind === "built-in" ? ("built-in" as const) : ("extension" as const),
		package: { name: packageName, version: "1.0.0", descriptorPath: label },
	};
}

function writeWorkspaceDescriptor(
	packagesRoot: string,
	relativePackageDir: string,
	packageName: string,
): void {
	const root = path.join(packagesRoot, relativePackageDir);
	writeDescriptorPackage(root, packageName, { description: "Workspace extension." });
}

function writeUserDescriptor(homeDir: string, directoryName: string, packageName: string): string {
	const root = path.join(homeDir, "extensions", directoryName);
	writeDescriptorPackage(root, packageName, { description: "User extension." });
	return root;
}

function writeDescriptorPackage(
	root: string,
	packageName: string,
	descriptor: Record<string, unknown>,
): void {
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
