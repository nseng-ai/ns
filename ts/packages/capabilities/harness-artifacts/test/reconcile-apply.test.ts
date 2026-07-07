import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	contentHashForText,
	INSTALL_MANIFEST_FILE_NAME,
	runHarnessArtifactReconcile,
	type HarnessArtifactFileSystemGateway,
	type InstallManifestData,
} from "../src/index.ts";
import type {
	HarnessArtifactModuleDiscoveryGateway,
	ModuleDiscoveryDirectoryEntry,
	ModuleDiscoveryPathState,
} from "../src/module-artifact-discovery.ts";

type FakeNode = { type: "file"; bytes: Uint8Array } | { type: "directory" } | { type: "other" };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class InMemoryHarnessFs
	implements HarnessArtifactFileSystemGateway, HarnessArtifactModuleDiscoveryGateway
{
	readonly nodes: Map<string, FakeNode>;
	readonly writtenFiles: string[] = [];

	constructor(files: Record<string, string | FakeNode>) {
		this.nodes = new Map();
		for (const [path, value] of Object.entries(files)) {
			this.nodes.set(
				path,
				typeof value === "string" ? { type: "file", bytes: textEncoder.encode(value) } : value,
			);
			this.ensureParentDirectories(path);
		}
	}

	async listFiles(rootPath: string) {
		const prefix = `${rootPath}/`;
		const paths = [...this.nodes.entries()]
			.filter(([path, node]) => path.startsWith(prefix) && node.type === "file")
			.map(([path]) => path.slice(prefix.length))
			.sort((left, right) => left.localeCompare(right));
		return { ok: true as const, value: paths };
	}

	async readOptionalFile(path: string) {
		const node = this.nodes.get(path);
		if (node?.type === "file") {
			return { ok: true as const, value: { type: "file" as const, bytes: node.bytes } };
		}
		return { ok: true as const, value: { type: "missing" as const } };
	}

	async writeFile(path: string, bytes: Uint8Array) {
		this.writeBytes(path, bytes);
		return { ok: true as const, value: undefined };
	}

	async readOptionalTextFile(path: string) {
		const node = this.nodes.get(path);
		if (node?.type === "file") {
			return {
				ok: true as const,
				value: { type: "file" as const, text: textDecoder.decode(node.bytes) },
			};
		}
		return { ok: true as const, value: { type: "missing" as const } };
	}

	async writeTextFile(path: string, text: string) {
		this.writeBytes(path, textEncoder.encode(text));
		return { ok: true as const, value: undefined };
	}

	private writeBytes(path: string, bytes: Uint8Array): void {
		this.nodes.set(path, { type: "file", bytes });
		this.ensureParentDirectories(path);
		this.writtenFiles.push(path);
	}

	async readDirectory(path: string) {
		const node = this.nodes.get(path);
		if (node === undefined) return { ok: true as const, value: { type: "missing" as const } };
		if (node.type !== "directory") return { ok: true as const, value: { type: "file" as const } };
		return {
			ok: true as const,
			value: { type: "directory" as const, entries: this.directoryEntries(path) },
		};
	}

	async pathState(path: string) {
		const node = this.nodes.get(path);
		if (node === undefined) return { ok: true as const, value: { type: "missing" as const } };
		return { ok: true as const, value: { type: node.type } satisfies ModuleDiscoveryPathState };
	}

	setFile(path: string, text: string): void {
		this.nodes.set(path, { type: "file", bytes: textEncoder.encode(text) });
		this.ensureParentDirectories(path);
	}

	readText(path: string): string | undefined {
		const node = this.nodes.get(path);
		return node?.type === "file" ? textDecoder.decode(node.bytes) : undefined;
	}

	clearWrittenFiles(): void {
		this.writtenFiles.length = 0;
	}

	private ensureParentDirectories(path: string): void {
		let current = path;
		while (current !== "/") {
			current = current.slice(0, current.lastIndexOf("/")) || "/";
			if (!this.nodes.has(current)) this.nodes.set(current, { type: "directory" });
		}
	}

	private directoryEntries(path: string): readonly ModuleDiscoveryDirectoryEntry[] {
		const prefix = path === "/" ? "/" : `${path}/`;
		const names = new Set<string>();
		for (const nodePath of this.nodes.keys()) {
			if (!nodePath.startsWith(prefix) || nodePath === path) continue;
			const name = nodePath.slice(prefix.length).split("/")[0];
			if (name !== undefined && name !== "") names.add(name);
		}
		return [...names]
			.sort((left, right) => left.localeCompare(right))
			.map((name) => {
				const child = this.nodes.get(join(path, name));
				return { name, type: childType(child) };
			});
	}
}

describe("harness artifact reconcile driver", () => {
	test("fresh install writes target files and a manifest with per-file hashes", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.artifacts.map((artifact) => artifact.action)).toEqual([
			"installed",
			"installed",
		]);
		expect(result.value.artifacts.flatMap((artifact) => artifact.writtenFiles)).toEqual([
			"/repo/.pi/skills/module-skill/SKILL.md",
			"/repo/.pi/skills/objective/SKILL.md",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("module v1\n");
		const manifest = fixture.readManifest("/repo/.pi/skills");
		expect(
			manifest.artifacts["pi:project:skill:objective-skill"]?.files["SKILL.md"]?.contentHash,
		).toBe(contentHashForText("objective v1\n"));
		expect(
			manifest.artifacts["pi:project:skill:@acme/module:module-skill"]?.files["SKILL.md"]
				?.contentHash,
		).toBe(contentHashForText("module v1\n"));
	});

	test("idempotent re-run reports unchanged and no written artifact files", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		await runHarnessArtifactReconcile(fixture.request());
		fixture.fs.clearWrittenFiles();

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.artifacts.map((artifact) => artifact.action)).toEqual([
			"unchanged",
			"unchanged",
		]);
		expect(result.value.artifacts.flatMap((artifact) => artifact.writtenFiles)).toEqual([]);
	});

	test("source changes refresh target files and manifest hashes", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		await runHarnessArtifactReconcile(fixture.request());
		fixture.fs.setFile("/first-party/skills/objective/SKILL.md", "objective v2\n");

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(
			result.value.artifacts.find((artifact) => artifact.skillName === "objective")?.action,
		).toBe("refreshed");
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v2\n");
		expect(
			fixture.readManifest("/repo/.pi/skills").artifacts["pi:project:skill:objective-skill"]?.files[
				"SKILL.md"
			]?.contentHash,
		).toBe(contentHashForText("objective v2\n"));
	});

	test("local target edits conflict in dry-run and apply without force and are overwritten with force", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		await runHarnessArtifactReconcile(fixture.request());
		fixture.fs.setFile("/repo/.pi/skills/objective/SKILL.md", "local edit\n");

		const dryRunConflict = await runHarnessArtifactReconcile(fixture.request({ dryRun: true }));

		expect(dryRunConflict).toMatchObject({ ok: true });
		if (!dryRunConflict.ok) return;
		expect(dryRunConflict.value.mode).toBe("dry-run");
		expect(dryRunConflict.value.needsForce).toBe(true);
		expect(
			dryRunConflict.value.artifacts.find((artifact) => artifact.skillName === "objective"),
		).toMatchObject({
			action: "conflicted",
			conflictingFiles: ["/repo/.pi/skills/objective/SKILL.md"],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("local edit\n");

		const conflict = await runHarnessArtifactReconcile(fixture.request());

		expect(conflict).toMatchObject({ ok: true });
		if (!conflict.ok) return;
		expect(conflict.value.needsForce).toBe(true);
		expect(
			conflict.value.artifacts.find((artifact) => artifact.skillName === "objective"),
		).toMatchObject({
			action: "conflicted",
			conflictingFiles: ["/repo/.pi/skills/objective/SKILL.md"],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("local edit\n");

		const forced = await runHarnessArtifactReconcile(fixture.request({ force: true }));

		expect(forced).toMatchObject({ ok: true });
		if (!forced.ok) return;
		expect(forced.value.needsForce).toBe(false);
		expect(
			forced.value.artifacts.find((artifact) => artifact.skillName === "objective"),
		).not.toMatchObject({ action: "conflicted" });
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
	});

	test("missing ns.toml skips new installs while refreshing manifest-tracked entries", async () => {
		const fixture = createFixture({ nsToml: undefined });
		fixture.fs.setFile("/repo/.pi/skills/module-skill/SKILL.md", "module v1\n");
		fixture.writeManifest("/repo/.pi/skills", moduleManifest());
		fixture.fs.setFile("/repo/.ns/extensions/acme/skills/module/SKILL.md", "module v2\n");

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.harnessSelection).toEqual({ type: "missing" });
		expect(result.value.artifacts.map((artifact) => [artifact.skillName, artifact.action])).toEqual(
			[["module-skill", "refreshed"]],
		);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("module v2\n");
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBeUndefined();
	});

	test("skips colliding artifacts while provisioning non-colliding artifacts", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		fixture.fs.setFile("/repo/.ns/extensions/collision/package.json", duplicateModulePackageJson());
		fixture.fs.setFile("/repo/.ns/extensions/collision/skills/duplicate/SKILL.md", "duplicate\n");

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.skippedCollisions).toEqual([
			{
				kind: "target-name",
				value: "module-skill",
				packages: ["@acme/collision", "@acme/module"],
			},
		]);
		expect(result.value.artifacts.map((artifact) => [artifact.skillName, artifact.action])).toEqual(
			[
				["module-skill", "skipped"],
				["module-skill", "skipped"],
				["objective", "installed"],
			],
		);
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBeUndefined();
	});

	test("reports orphans without touching their files and invalid ns.toml is an error", async () => {
		const orphanFixture = createFixture({ nsToml: undefined, includeModule: false });
		orphanFixture.fs.setFile("/repo/.pi/skills/old/SKILL.md", "local orphan\n");
		orphanFixture.writeManifest("/repo/.pi/skills", orphanManifest());

		const orphanResult = await runHarnessArtifactReconcile(orphanFixture.request());

		expect(orphanResult).toMatchObject({ ok: true });
		if (!orphanResult.ok) return;
		expect(orphanResult.value.artifacts).toEqual([]);
		expect(orphanResult.value.orphans).toMatchObject([{ artifactId: "@gone/ext:old-skill" }]);
		expect(orphanFixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBe("local orphan\n");

		const invalidFixture = createFixture({ nsToml: "harnesses = [123]\n" });
		const invalidResult = await runHarnessArtifactReconcile(invalidFixture.request());
		expect(invalidResult).toMatchObject({ ok: false, error: { code: "invalid_ns_toml" } });
	});
});

function createFixture(options: { nsToml: string | undefined; includeModule?: boolean }) {
	const files: Record<string, string> = {
		"/first-party/skills/objective/SKILL.md": "objective v1\n",
	};
	if (options.nsToml !== undefined) files["/repo/ns.toml"] = options.nsToml;
	if (options.includeModule !== false) {
		files["/repo/.ns/extensions/acme/package.json"] = packageJson();
		files["/repo/.ns/extensions/acme/skills/module/SKILL.md"] = "module v1\n";
	}
	const fs = new InMemoryHarnessFs(files);
	return {
		fs,
		request(overrides: { dryRun?: boolean; force?: boolean } = {}) {
			return {
				projectRoot: "/repo",
				homeDir: "/home/alice",
				env: { XDG_DATA_HOME: "/home/alice/.local/share" },
				dryRun: overrides.dryRun ?? false,
				force: overrides.force ?? false,
				fs,
				discoveryGateway: fs,
				firstPartySourceRoot: "/first-party",
			};
		},
		readManifest(targetRoot: string): InstallManifestData {
			return JSON.parse(
				fs.readText(join(targetRoot, INSTALL_MANIFEST_FILE_NAME)) ?? "",
			) as InstallManifestData;
		},
		writeManifest(targetRoot: string, manifest: InstallManifestData): void {
			fs.setFile(
				join(targetRoot, INSTALL_MANIFEST_FILE_NAME),
				`${JSON.stringify(manifest, null, 2)}\n`,
			);
		},
	};
}

function packageJson(): string {
	return JSON.stringify({
		name: "@acme/module",
		version: "1.0.0",
		ns: { harnessArtifacts: [{ kind: "skill", name: "module-skill", path: "skills/module" }] },
	});
}

function duplicateModulePackageJson(): string {
	return JSON.stringify({
		name: "@acme/collision",
		version: "1.0.0",
		ns: {
			harnessArtifacts: [{ kind: "skill", name: "module-skill", path: "skills/duplicate" }],
		},
	});
}

function moduleManifest(): InstallManifestData {
	return {
		version: 1,
		artifacts: {
			"pi:project:skill:@acme/module:module-skill": manifestEntry({
				artifactId: "@acme/module:module-skill",
				provisionName: "module-skill",
				packageName: "@acme/module",
				relativePath: "skills/module",
				content: "module v1\n",
			}),
		},
	};
}

function orphanManifest(): InstallManifestData {
	return {
		version: 1,
		artifacts: {
			"pi:project:skill:@gone/ext:old-skill": manifestEntry({
				artifactId: "@gone/ext:old-skill",
				provisionName: "old",
				packageName: "@gone/ext",
				relativePath: "skills/old",
				content: "old\n",
			}),
		},
	};
}

function manifestEntry(input: {
	artifactId: string;
	provisionName: string;
	packageName: string;
	relativePath: string;
	content: string;
}): InstallManifestData["artifacts"][string] {
	return {
		artifactId: input.artifactId,
		kind: "skill",
		provisionName: input.provisionName,
		harness: "pi",
		scope: "project",
		targetRoot: "/repo/.pi/skills",
		targetArtifactPath: `/repo/.pi/skills/${input.provisionName}`,
		source: {
			type: "npm-module",
			packageName: input.packageName,
			relativePath: input.relativePath,
			version: "1.0.0",
		},
		files: {
			"SKILL.md": {
				sourcePath: `${input.relativePath}/SKILL.md`,
				targetPath: `/repo/.pi/skills/${input.provisionName}/SKILL.md`,
				contentHash: contentHashForText(input.content),
			},
		},
	};
}

function childType(node: FakeNode | undefined): ModuleDiscoveryDirectoryEntry["type"] {
	if (node?.type === "directory") return "directory";
	if (node?.type === "file") return "file";
	return "other";
}
