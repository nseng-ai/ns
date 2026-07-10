import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	applyPreparedDeclaredArtifactActivation,
	contentHashForText,
	INSTALL_MANIFEST_FILE_NAME,
	prepareDeclaredArtifactActivation,
	type DeclaredExtensionModuleArtifactFacts,
	type InstallManifestData,
} from "../src/index.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

describe("declared artifact activation", () => {
	test("prepares and applies only supplied declarations for selected harnesses in identity order", async () => {
		const fixture = createFixture([moduleFacts("/modules/zeta", "@acme/zeta", "zeta")]);

		const prepared = await fixture.prepare(["pi", "codex"]);

		expect(prepared).toMatchObject({ ok: true });
		if (!prepared.ok) return;
		expect(prepared.value.artifacts.map((item) => item.key)).toEqual([
			"codex:project:skill:@acme/zeta:zeta",
			"pi:project:skill:@acme/zeta:zeta",
		]);
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value, {
			shouldForce: false,
		});
		expect(applied).toMatchObject({
			ok: true,
			completed: [{ action: "installed" }, { action: "installed" }],
		});
		expect(fixture.fs.readText("/repo/.agents/skills/zeta/SKILL.md")).toBe("zeta v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/zeta/SKILL.md")).toBe("zeta v1\n");
		expect(fixture.fs.readText("/repo/.claude/skills/zeta/SKILL.md")).toBeUndefined();
		expect(fixture.fs.readText("/repo/.pi/skills/objective/SKILL.md")).toBeUndefined();
	});

	test("refreshes changed declarations and reports an unchanged idempotent rerun", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		const first = await fixture.prepare(["pi"]);
		if (!first.ok) return;
		await applyPreparedDeclaredArtifactActivation(first.value, { shouldForce: false });

		const unchanged = await fixture.prepare(["pi"]);
		expect(unchanged).toMatchObject({ ok: true, value: { artifacts: [{ action: "unchanged" }] } });
		if (!unchanged.ok) return;
		fixture.fs.clearWrittenFiles();
		const unchangedApply = await applyPreparedDeclaredArtifactActivation(unchanged.value, {
			shouldForce: false,
		});
		expect(unchangedApply).toMatchObject({ ok: true, completed: [{ action: "unchanged" }] });
		expect(fixture.fs.writtenFiles).toEqual([]);

		fixture.fs.setFile("/modules/acme/skills/module/SKILL.md", "module v2\n");
		const refreshed = await fixture.prepare(["pi"]);
		expect(refreshed).toMatchObject({ ok: true, value: { artifacts: [{ action: "refreshed" }] } });
		if (!refreshed.ok) return;
		const refreshApply = await applyPreparedDeclaredArtifactActivation(refreshed.value, {
			shouldForce: false,
		});
		expect(refreshApply).toMatchObject({ ok: true, completed: [{ action: "refreshed" }] });
		expect(fixture.fs.readText("/repo/.pi/skills/module/SKILL.md")).toBe("module v2\n");
	});

	test("surfaces declaration paths, collisions, and local conflicts before writes", async () => {
		const modules = [
			moduleFacts("/modules/one", "@acme/one", "shared"),
			moduleFacts("/modules/two", "@acme/two", "shared"),
			{
				...moduleFacts("/modules/bad", "@acme/bad", "bad"),
				descriptor: {
					description: "bad",
					bundledArtifacts: [{ kind: "skill" as const, name: "bad", path: "missing" }],
				},
			},
		];
		const fixture = createFixture(modules);
		fixture.fs.nodes.delete("/modules/bad/missing/SKILL.md");
		fixture.fs.setFile("/repo/.pi/skills/safe/SKILL.md", "local edit\n");
		fixture.modules.push(moduleFacts("/modules/safe", "@acme/safe", "safe"));
		fixture.fs.setFile("/modules/safe/skills/safe/SKILL.md", "safe v1\n");

		const prepared = await fixture.prepare(["pi"]);

		expect(prepared).toMatchObject({ ok: true });
		if (!prepared.ok) return;
		expect(prepared.value.diagnostics).toMatchObject([
			{ code: "module_artifact_duplicate_target_name", artifactId: "@acme/one:shared" },
			{ code: "module_artifact_duplicate_target_name", artifactId: "@acme/two:shared" },
			{ code: "module_artifact_skill_entry_missing", artifactId: "@acme/bad:bad" },
		]);
		expect(prepared.value.skippedCollisions).toEqual([
			{ kind: "target-name", value: "shared", packages: ["@acme/one", "@acme/two"] },
		]);
		expect(prepared.value.artifacts).toMatchObject([{ action: "conflicted" }]);
		expect(fixture.fs.writtenFiles).toEqual([]);
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value, {
			shouldForce: false,
		});
		expect(applied).toMatchObject({ ok: true, completed: [{ action: "conflicted" }] });
		expect(fixture.fs.readText("/repo/.pi/skills/safe/SKILL.md")).toBe("local edit\n");
	});

	test("preserves stale manifest entries while adding declared artifacts", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		fixture.writeManifest(staleManifest());

		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value, {
			shouldForce: false,
		});

		expect(applied.ok).toBe(true);
		expect(Object.keys(fixture.readManifest().artifacts)).toEqual([
			"pi:project:skill:@acme/ext:module",
			"pi:project:skill:@gone/ext:old",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBe("old\n");
	});
});

function moduleFacts(
	moduleRoot: string,
	packageName: string,
	skillName: string,
): DeclaredExtensionModuleArtifactFacts {
	return {
		moduleRoot,
		packageName,
		version: "1.0.0",
		descriptor: {
			description: packageName,
			bundledArtifacts: [{ kind: "skill", name: skillName, path: `skills/${skillName}` }],
		},
	};
}

function createFixture(initialModules: readonly DeclaredExtensionModuleArtifactFacts[]) {
	const modules = [...initialModules];
	const files: Record<string, string> = {};
	for (const module of modules) {
		const declaration = module.descriptor.bundledArtifacts?.[0];
		if (declaration?.kind === "skill") {
			files[join(module.moduleRoot, declaration.path, "SKILL.md")] = `${declaration.name} v1\n`;
		}
	}
	files["/repo/.pi/skills/old/SKILL.md"] = "old\n";
	const fs = new InMemoryHarnessFs(files);
	return {
		fs,
		modules,
		prepare(selectedHarnesses: readonly ("claude-code" | "codex" | "pi")[]) {
			return prepareDeclaredArtifactActivation({
				projectRoot: "/repo",
				modules,
				selectedHarnesses,
				fs,
				discoveryGateway: fs,
			});
		},
		readManifest(): InstallManifestData {
			return JSON.parse(
				fs.readText(`/repo/.pi/skills/${INSTALL_MANIFEST_FILE_NAME}`) ?? "",
			) as InstallManifestData;
		},
		writeManifest(manifest: InstallManifestData): void {
			fs.setFile(
				`/repo/.pi/skills/${INSTALL_MANIFEST_FILE_NAME}`,
				`${JSON.stringify(manifest, null, 2)}\n`,
			);
		},
	};
}

function staleManifest(): InstallManifestData {
	return {
		version: 1,
		artifacts: {
			"pi:project:skill:@gone/ext:old": {
				artifactId: "@gone/ext:old",
				kind: "skill",
				provisionName: "old",
				harness: "pi",
				scope: "project",
				targetRoot: "/repo/.pi/skills",
				targetArtifactPath: "/repo/.pi/skills/old",
				source: {
					type: "npm-module",
					packageName: "@gone/ext",
					relativePath: "skills/old",
					version: "1.0.0",
				},
				files: {
					"SKILL.md": {
						sourcePath: "skills/old/SKILL.md",
						targetPath: "/repo/.pi/skills/old/SKILL.md",
						contentHash: contentHashForText("old\n"),
					},
				},
			},
		},
	};
}
