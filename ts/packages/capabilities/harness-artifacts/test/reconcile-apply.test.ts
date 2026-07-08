import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	contentHashForText,
	INSTALL_MANIFEST_FILE_NAME,
	runHarnessArtifactReconcile,
	type InstallManifestData,
} from "../src/index.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

describe("harness artifact reconcile driver", () => {
	test("fresh install writes target files and a manifest with per-file hashes", async () => {
		const fixture = createFixture({ nsToml: 'harnesses = ["pi"]\n' });

		const result = await runHarnessArtifactReconcile(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.artifacts.map((artifact) => artifact.action)).toEqual(["installed"]);
		expect(result.value.artifacts.flatMap((artifact) => artifact.writtenFiles)).toEqual([
			"/repo/.pi/skills/objective/SKILL.md",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBe("objective v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/module-skill/SKILL.md")).toBeUndefined();
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
		expect(result.value.artifacts.map((artifact) => artifact.action)).toEqual(["unchanged"]);
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

		const dryRunConflict = await runHarnessArtifactReconcile(fixture.request({ isDryRun: true }));

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
		expect(result.value.skippedCollisions).toEqual([]);
		expect(result.value.artifacts.map((artifact) => [artifact.skillName, artifact.action])).toEqual(
			[["objective", "installed"]],
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
		request(overrides: { isDryRun?: boolean; shouldForce?: boolean } = {}) {
			return {
				projectRoot: "/repo",
				homeDir: "/home/alice",
				env: { XDG_DATA_HOME: "/home/alice/.local/share" },
				isDryRun: overrides.isDryRun ?? false,
				shouldForce: overrides.shouldForce ?? false,
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

function packageJson(name: string): string {
	return JSON.stringify({
		name,
		version: "1.0.0",
		exports: { "./ns-extension": "./src/ns/extension.ts" },
	});
}

function descriptorSource(artifact: { name: string; path: string }): string {
	return `import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	description: "Test extension.",
	bundledArtifacts: [{ kind: "skill", name: ${JSON.stringify(artifact.name)}, path: ${JSON.stringify(artifact.path)} }],
});
`;
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
