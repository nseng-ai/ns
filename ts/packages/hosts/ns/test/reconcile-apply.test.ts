import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { ExtensionAcquisitionGateway } from "@nseng-ai/sdk/extensions/acquisition";
import type {
	DeclaredDescriptorFileResult,
	DeclaredDescriptorImportResult,
	DeclaredDescriptorPackageManifestResult,
	DeclaredExtensionDescriptorGateway,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/sdk/testing";
import {
	contentHashForText,
	INSTALL_MANIFEST_FILE_NAME,
	runHarnessArtifactReconcile,
	type InstallManifestData,
} from "../src/harness-artifacts/index.ts";
import { descriptorExtensionSource, descriptorPackageJson } from "./support/descriptor-fixtures.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

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
		expect(result.value.artifacts.flatMap((artifact) => artifact.writtenFiles).sort()).toEqual([
			"/repo/.pi/skills/module-skill/SKILL.md",
			"/repo/.pi/skills/objective/SKILL.md",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("module v1\n");
		const manifest = fixture.readManifest("/repo/.pi/skills");
		expect(
			manifest.artifacts["pi:project:skill:objective-skill"]?.files["SKILL.md"]?.contentHash,
		).toBe(contentHashForText("objective v1\n"));
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

		const dryRunConflict = await runHarnessArtifactReconcile(fixture.request({ mode: "preview" }));

		expect(dryRunConflict).toMatchObject({ ok: true });
		if (!dryRunConflict.ok) return;
		expect(dryRunConflict.value.mode).toBe("dry-run");
		expect(dryRunConflict.value.isForceRequired).toBe(true);
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
		expect(conflict.value.isForceRequired).toBe(true);
		expect(
			conflict.value.artifacts.find((artifact) => artifact.skillName === "objective"),
		).toMatchObject({
			action: "conflicted",
			conflictingFiles: ["/repo/.pi/skills/objective/SKILL.md"],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("local edit\n");

		const forced = await runHarnessArtifactReconcile(fixture.request({ shouldForce: true }));

		expect(forced).toMatchObject({ ok: true });
		if (!forced.ok) return;
		expect(forced.value.isForceRequired).toBe(false);
		expect(
			forced.value.artifacts.find((artifact) => artifact.skillName === "objective"),
		).not.toMatchObject({ action: "conflicted" });
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
	});

	test("declared local extension paths provision artifacts and can be targeted", async () => {
		const fixture = createFixture({
			nsToml: 'harnesses = ["pi"]\nextensions = ["./local-ext", "./other-ext"]\n',
			includeModule: false,
		});
		fixture.fs.setFile("/repo/local-ext/package.json", packageJson("@acme/local"));
		fixture.fs.setFile("/repo/local-ext/skills/module/SKILL.md", "local v1\n");
		fixture.fs.setFile("/repo/other-ext/package.json", packageJson("@acme/other"));
		fixture.fs.setFile("/repo/other-ext/skills/module/SKILL.md", "other v1\n");

		const targeted = await runHarnessArtifactReconcile(
			fixture.request({
				extensionTarget: "./local-ext",
				descriptorGateway: new TestDescriptorGateway(fixture.fs),
			}),
		);

		expect(targeted).toMatchObject({ ok: true });
		if (!targeted.ok) return;
		expect(targeted.value.artifacts.map((artifact) => artifact.packageName)).toEqual([
			"@acme/local",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("local v1\n");

		const undeclared = await runHarnessArtifactReconcile(
			fixture.request({ extensionTarget: "./undeclared-ext" }),
		);
		expect(undeclared).toMatchObject({
			ok: false,
			error: {
				code: "invalid_extension_target",
				message:
					"Extension target is not declared in ns.toml: ./undeclared-ext. Run ns extension install ./undeclared-ext to declare and provision it before updating it.",
			},
		});
	});

	test("declared npm extensions acquire managed package roots and provision static artifacts", async () => {
		const fixture = createFixture({
			nsToml: 'harnesses = ["pi"]\nextensions = ["npm:@acme/module@1.0.0"]\n',
			includeModule: false,
		});
		fixture.fs.setFile(
			"/repo/.ns/managed-extensions/npm/@acme/module/node_modules/@acme/module/package.json",
			packageJson("@acme/module"),
		);
		fixture.fs.setFile(
			"/repo/.ns/managed-extensions/npm/@acme/module/node_modules/@acme/module/skills/module/SKILL.md",
			"npm v1\n",
		);
		const acquisitionGateway = new FakeExtensionAcquisitionGateway();

		const result = await runHarnessArtifactReconcile(
			fixture.request({
				extensionTarget: "npm:@acme/module@1.0.0",
				acquisitionGateway,
				descriptorGateway: new TestDescriptorGateway(fixture.fs),
			}),
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(acquisitionGateway.installs.map((install) => install.rawSpec)).toEqual([
			"npm:@acme/module@1.0.0",
		]);
		expect(result.value.artifacts.map((artifact) => artifact.packageName)).toEqual([
			"@acme/module",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("npm v1\n");
	});

	test("reconcile refreshes installed floating npm extensions but keeps pinned installs stable", async () => {
		for (const source of ["npm:@acme/module", "npm:@acme/module@1.0.0"] as const) {
			const fixture = createFixture({
				nsToml: `harnesses = ["pi"]\nextensions = ["${source}"]\n`,
				includeModule: false,
			});
			const packageRoot = "/repo/.ns/managed-extensions/npm/@acme/module/node_modules/@acme/module";
			fixture.fs.setFile(`${packageRoot}/package.json`, packageJson("@acme/module"));
			fixture.fs.setFile(`${packageRoot}/skills/module/SKILL.md`, "npm v1\n");
			const acquisitionGateway = new FakeExtensionAcquisitionGateway({
				installedPackageRoots: [packageRoot],
			});

			const result = await runHarnessArtifactReconcile(
				fixture.request({
					acquisitionGateway,
					descriptorGateway: new TestDescriptorGateway(fixture.fs),
				}),
			);

			expect(result).toMatchObject({ ok: true });
			expect(acquisitionGateway.installs.map((install) => install.rawSpec)).toEqual(
				source.includes("@1.0.0") ? [] : [source],
			);
		}
	});

	test("declared-only npm targeting rejects undeclared specs", async () => {
		const fixture = createFixture({
			nsToml: 'harnesses = ["pi"]\nextensions = ["npm:@acme/module@1.0.0"]\n',
			includeModule: false,
		});

		const result = await runHarnessArtifactReconcile(
			fixture.request({ extensionTarget: "npm:@acme/other@1.0.0" }),
		);

		expect(result).toMatchObject({ ok: false, error: { code: "invalid_extension_target" } });
	});

	test("npm acquisition diagnostics do not block local extension provisioning", async () => {
		const fixture = createFixture({
			nsToml: 'harnesses = ["pi"]\nextensions = ["npm:@acme/bad", "./local-ext"]\n',
			includeModule: false,
		});
		fixture.fs.setFile("/repo/local-ext/package.json", packageJson("@acme/local"));
		fixture.fs.setFile("/repo/local-ext/skills/module/SKILL.md", "local v1\n");
		const acquisitionGateway = new FakeExtensionAcquisitionGateway();
		acquisitionGateway.failSpec = "npm:@acme/bad";

		const result = await runHarnessArtifactReconcile(
			fixture.request({
				acquisitionGateway,
				descriptorGateway: new TestDescriptorGateway(fixture.fs),
			}),
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.diagnostics).toMatchObject([
			{ code: "extension_acquisition_npm_install_failed" },
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("local v1\n");
	});

	test("missing ns.toml skips new installs while refreshing manifest-tracked entries", async () => {
		const fixture = createFixture({ nsToml: undefined });
		fixture.fs.setFile("/repo/.pi/skills/module-skill/SKILL.md", "module v1\n");
		fixture.writeManifest("/repo/.pi/skills", moduleManifest());
		fixture.fs.setFile("/repo/extensions/acme/skills/module/SKILL.md", "module v2\n");

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.harnessSelection).toEqual({ type: "missing" });
		expect(result.value.artifacts).toEqual([]);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("module v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBeUndefined();
	});

	test("skips colliding artifacts while provisioning non-colliding artifacts", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		fixture.fs.setFile(
			"/repo/ns.toml",
			'harnesses = ["pi"]\nextensions = ["./extensions/acme", "./extensions/collision"]\n',
		);
		fixture.fs.setFile("/repo/extensions/collision/package.json", packageJson("@acme/collision"));
		fixture.fs.setFile(
			"/repo/extensions/collision/src/ns/extension.ts",
			descriptorSource({ name: "module-skill", path: "skills/duplicate" }),
		);
		fixture.fs.setFile("/repo/extensions/collision/skills/duplicate/SKILL.md", "duplicate\n");

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

	// Regression: a checkout-free install can never resolve a first-party catalog source
	// root, because the published @nseng-ai/ns tarball ships no first-party skill sources.
	// That used to abort the whole reconcile with first_party_source_root_unavailable.
	test("unresolvable first-party catalog source still reconciles module artifacts", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		await runHarnessArtifactReconcile(fixture.request());
		fixture.fs.setFile("/repo/extensions/acme/skills/module/SKILL.md", "module v2\n");

		const result = await runHarnessArtifactReconcile(
			fixture.request({ isFirstPartyCatalogSourceUnavailable: true }),
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.artifacts.map((artifact) => [artifact.skillName, artifact.action])).toEqual(
			[["module-skill", "refreshed"]],
		);
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBe("module v2\n");
	});

	// Regression: skipping the first-party catalog must not make already provisioned
	// first-party entries look like removed sources under full deletion authority.
	test("unresolvable first-party catalog preserves already provisioned first-party artifacts", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });
		await runHarnessArtifactReconcile(fixture.request());
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");

		const result = await runHarnessArtifactReconcile(
			fixture.request({ isFirstPartyCatalogSourceUnavailable: true }),
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
		expect(result.value.artifacts.filter((artifact) => artifact.action === "removed")).toEqual([]);
		expect(
			fixture.readManifest("/repo/.pi/skills").artifacts["pi:project:skill:objective-skill"],
		).toBeDefined();
	});
});

function createFixture(options: { nsToml: string | undefined; includeModule?: boolean }) {
	const files: Record<string, string> = {
		"/first-party/skills/objective/SKILL.md": "objective v1\n",
	};
	if (options.nsToml !== undefined) {
		files["/repo/ns.toml"] =
			options.includeModule === false
				? options.nsToml
				: `${options.nsToml}\nextensions = ["./extensions/acme"]\n`;
	}
	if (options.includeModule !== false) {
		files["/repo/extensions/acme/package.json"] = packageJson("@acme/module");
		files["/repo/extensions/acme/src/ns/extension.ts"] = descriptorSource({
			name: "module-skill",
			path: "skills/module",
		});
		files["/repo/extensions/acme/skills/module/SKILL.md"] = "module v1\n";
	}
	const fs = new InMemoryHarnessFs(files);
	return {
		fs,
		request(
			overrides: {
				mode?: "preview" | "check-force" | "apply";
				shouldForce?: boolean;
				extensionTarget?: string;
				acquisitionGateway?: ExtensionAcquisitionGateway;
				descriptorGateway?: DeclaredExtensionDescriptorGateway;
				isFirstPartyCatalogSourceUnavailable?: boolean;
			} = {},
		) {
			return {
				projectRoot: "/repo",
				homeDir: "/home/alice",
				env: { XDG_DATA_HOME: "/home/alice/.local/share" },
				mode: overrides.mode ?? "apply",
				shouldForce: overrides.shouldForce ?? false,
				...(overrides.extensionTarget === undefined
					? {}
					: { extensionTarget: overrides.extensionTarget }),
				...(overrides.acquisitionGateway === undefined
					? {}
					: { acquisitionGateway: overrides.acquisitionGateway }),
				descriptorGateway: overrides.descriptorGateway ?? new TestDescriptorGateway(fs),
				fs,
				discoveryGateway: fs,
				// A checkout-free install resolves no first-party catalog source root at all,
				// so that case must omit the override rather than point at a missing directory.
				...(overrides.isFirstPartyCatalogSourceUnavailable === true
					? { resolveFirstPartySourceRoot: () => undefined }
					: { firstPartySourceRoot: "/first-party" }),
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

function packageJson(name: string): string {
	return descriptorPackageJson({ name, version: "1.0.0" });
}

function descriptorSource(artifact: { name: string; path: string }): string {
	return descriptorExtensionSource({
		description: "Test extension.",
		bundledArtifacts: [{ kind: "skill", name: artifact.name, path: artifact.path }],
	});
}

class TestDescriptorGateway implements DeclaredExtensionDescriptorGateway {
	readonly #fs: InMemoryHarnessFs;

	constructor(fs: InMemoryHarnessFs) {
		this.#fs = fs;
	}

	async readPackageManifest(path: string): Promise<DeclaredDescriptorPackageManifestResult> {
		const text = this.#fs.readText(path);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	async inspectDescriptorFile(_path: string): Promise<DeclaredDescriptorFileResult> {
		return { type: "found" };
	}

	async importDescriptorDefault(path: string): Promise<DeclaredDescriptorImportResult> {
		return {
			ok: true,
			defaultExport: {
				description: "Test extension.",
				bundledArtifacts: [
					{
						kind: "skill",
						name: "module-skill",
						path: path.includes("/collision/") ? "skills/duplicate" : "skills/module",
					},
				],
			},
		};
	}
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
