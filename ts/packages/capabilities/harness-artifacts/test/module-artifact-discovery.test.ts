import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	discoverExtensionModuleHarnessArtifacts,
	type HarnessArtifactModuleDiscoveryGateway,
	type ModuleDiscoveryDirectoryEntry,
	type ModuleDiscoveryPathState,
} from "../src/module-artifact-discovery.ts";

type FakeNode =
	| { type: "file"; text: string }
	| { type: "directory"; entries?: readonly string[] }
	| { type: "other" }
	| { type: "error"; message: string };

function createFakeGateway(nodes: Record<string, FakeNode>): HarnessArtifactModuleDiscoveryGateway {
	return {
		async readDirectory(path) {
			const node = nodes[path];
			if (node === undefined) return { ok: true, value: { type: "missing" } };
			if (node.type === "error") {
				return {
					ok: false,
					error: {
						code: "filesystem_error",
						message: node.message,
						details: { path, operation: "list" },
					},
				};
			}
			if (node.type !== "directory") return { ok: true, value: { type: "file" } };
			return {
				ok: true,
				value: { type: "directory", entries: directoryEntries(path, nodes, node) },
			};
		},
		async readOptionalTextFile(path) {
			const node = nodes[path];
			if (node === undefined) return { ok: true, value: { type: "missing" } };
			if (node.type === "error") {
				return {
					ok: false,
					error: {
						code: "filesystem_error",
						message: node.message,
						details: { path, operation: "read" },
					},
				};
			}
			if (node.type !== "file") return { ok: true, value: { type: "missing" } };
			return { ok: true, value: { type: "file", text: node.text } };
		},
		async pathState(path) {
			const node = nodes[path];
			if (node === undefined) return { ok: true, value: { type: "missing" } };
			if (node.type === "error") {
				return {
					ok: false,
					error: {
						code: "filesystem_error",
						message: node.message,
						details: { path, operation: "stat" },
					},
				};
			}
			return { ok: true, value: { type: node.type } satisfies ModuleDiscoveryPathState };
		},
	};
}

describe("extension-root module artifact discovery", () => {
	test("enumerates global and project extension package declarations deterministically", async () => {
		const fixture = discoveryFixture({
			"/home/alice/.local/share/ns/extensions/global-ext/package.json": packageJson({
				name: "@acme/global-ext",
				version: "1.0.0",
				artifacts: [{ kind: "skill", name: "global-skill", path: "skills/global" }],
			}),
			"/home/alice/.local/share/ns/extensions/global-ext/skills/global/SKILL.md": "global\n",
			"/repo/.ns/extensions/project-ext/package.json": packageJson({
				name: "@acme/project-ext",
				version: "2.0.0",
				artifacts: [{ kind: "skill", name: "project-skill", path: "skills/project" }],
			}),
			"/repo/.ns/extensions/project-ext/skills/project/SKILL.md": "project\n",
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result.diagnostics).toEqual([]);
		expect(result.catalogs.map((catalog) => catalog.packageName)).toEqual([
			"@acme/global-ext",
			"@acme/project-ext",
		]);
		expect(
			result.catalogs.flatMap((catalog) => catalog.artifacts.map((artifact) => artifact.id)),
		).toEqual(["@acme/global-ext:global-skill", "@acme/project-ext:project-skill"]);
	});

	test("missing roots are empty and unreadable roots are diagnostics", async () => {
		const fixture = discoveryFixture({
			"/home/alice/.local/share/ns/extensions": { type: "error", message: "cannot list root" },
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result.catalogs).toEqual([]);
		expect(result.diagnostics).toMatchObject([
			{
				code: "module_artifact_extension_root_unreadable",
				path: "/home/alice/.local/share/ns/extensions",
			},
		]);
	});

	test("reports an invalid global extension root environment as a diagnostic", async () => {
		const result = await discoverExtensionModuleHarnessArtifacts({
			projectRoot: "/repo",
			env: { HOME: undefined, XDG_DATA_HOME: undefined },
			gateway: createFakeGateway({}),
		});

		expect(result.catalogs).toEqual([]);
		expect(result.diagnostics).toMatchObject([
			{ code: "module_artifact_extension_root_unavailable" },
		]);
	});

	test("ignores direct extension entry files and directories without package manifests", async () => {
		const fixture = discoveryFixture({
			"/repo/.ns/extensions/index.ts": "export default {};",
			"/repo/.ns/extensions/direct/index.ts": "export default {};",
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result).toEqual({ catalogs: [], diagnostics: [] });
	});

	test("surfaces package parser diagnostics", async () => {
		const fixture = discoveryFixture({
			"/repo/.ns/extensions/bad/package.json": "{",
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result.diagnostics).toMatchObject([
			{
				code: "module_artifact_package_json_invalid",
				path: "/repo/.ns/extensions/bad/package.json",
			},
		]);
	});

	test("diagnoses unsupported declarations and missing SKILL.md without hiding valid catalog data", async () => {
		const fixture = discoveryFixture({
			"/repo/.ns/extensions/ext/package.json": packageJson({
				name: "acme-ext",
				version: "1.0.0",
				artifacts: [
					{ kind: "agent", name: "bot", path: "agents/bot" },
					{ kind: "skill", name: "missing", path: "skills/missing" },
					{ kind: "skill", name: "valid", path: "skills/valid" },
				],
			}),
			"/repo/.ns/extensions/ext/skills/valid/SKILL.md": "valid\n",
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result.catalogs).toHaveLength(1);
		expect(result.catalogs[0]?.artifacts.map((artifact) => artifact.id)).toEqual([
			"acme-ext:valid",
		]);
		expect(result.catalogs[0]?.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"module_artifact_kind_unsupported",
			"module_artifact_skill_entry_missing",
		]);
	});

	test("diagnoses duplicate ids and target skill names across modules while preserving entries", async () => {
		const fixture = discoveryFixture({
			"/repo/.ns/extensions/left/package.json": packageJson({
				name: "acme-left",
				artifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			}),
			"/repo/.ns/extensions/left/skills/shared/SKILL.md": "left\n",
			"/repo/.ns/extensions/right/package.json": packageJson({
				name: "acme-right",
				artifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			}),
			"/repo/.ns/extensions/right/skills/shared/SKILL.md": "right\n",
			"/repo/.ns/extensions/right-copy/package.json": packageJson({
				name: "acme-right",
				artifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			}),
			"/repo/.ns/extensions/right-copy/skills/shared/SKILL.md": "right copy\n",
		});

		const result = await discoverExtensionModuleHarnessArtifacts(fixture.request);

		expect(result.catalogs.flatMap((catalog) => catalog.artifacts)).toHaveLength(3);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
			"module_artifact_duplicate_id",
			"module_artifact_duplicate_id",
			"module_artifact_duplicate_target_name",
			"module_artifact_duplicate_target_name",
			"module_artifact_duplicate_target_name",
		]);
	});
});

function discoveryFixture(files: Record<string, string | FakeNode>) {
	const nodes: Record<string, FakeNode> = {};
	for (const [path, value] of Object.entries(files)) {
		nodes[path] = typeof value === "string" ? { type: "file", text: value } : value;
		ensureParentDirectories(nodes, path);
	}
	return {
		request: {
			projectRoot: "/repo",
			homeDir: "/home/alice",
			env: { XDG_DATA_HOME: "/home/alice/.local/share" },
			gateway: createFakeGateway(nodes),
		},
	};
}

function ensureParentDirectories(nodes: Record<string, FakeNode>, path: string): void {
	let current = path;
	while (current !== "/") {
		current = current.slice(0, current.lastIndexOf("/")) || "/";
		if (nodes[current] === undefined) nodes[current] = { type: "directory" };
	}
}

function directoryEntries(
	path: string,
	nodes: Record<string, FakeNode>,
	node: Extract<FakeNode, { type: "directory" }>,
): readonly ModuleDiscoveryDirectoryEntry[] {
	const names = node.entries ?? immediateChildNames(path, nodes);
	return [...names]
		.sort((left, right) => left.localeCompare(right))
		.map((name) => {
			const child = nodes[join(path, name)];
			return { name, type: childType(child) };
		});
}

function immediateChildNames(path: string, nodes: Record<string, FakeNode>): string[] {
	const prefix = path === "/" ? "/" : `${path}/`;
	const names = new Set<string>();
	for (const nodePath of Object.keys(nodes)) {
		if (!nodePath.startsWith(prefix) || nodePath === path) continue;
		const relative = nodePath.slice(prefix.length);
		const name = relative.split("/")[0];
		if (name !== undefined && name !== "") names.add(name);
	}
	return [...names];
}

function childType(node: FakeNode | undefined): ModuleDiscoveryDirectoryEntry["type"] {
	if (node === undefined || node.type === "error") return "other";
	if (node.type === "directory") return "directory";
	if (node.type === "file") return "file";
	return "other";
}

function packageJson(options: {
	name: string;
	version?: string;
	artifacts: readonly unknown[];
}): string {
	return JSON.stringify({
		name: options.name,
		...(options.version === undefined ? {} : { version: options.version }),
		ns: { harnessArtifacts: options.artifacts },
	});
}
