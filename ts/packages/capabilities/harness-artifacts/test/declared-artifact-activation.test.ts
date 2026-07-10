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
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);
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
		await applyPreparedDeclaredArtifactActivation(first.value);

		const unchanged = await fixture.prepare(["pi"]);
		expect(unchanged).toMatchObject({ ok: true, value: { artifacts: [{ action: "unchanged" }] } });
		if (!unchanged.ok) return;
		fixture.fs.clearWrittenFiles();
		const unchangedApply = await applyPreparedDeclaredArtifactActivation(unchanged.value);
		expect(unchangedApply).toMatchObject({ ok: true, completed: [{ action: "unchanged" }] });
		expect(fixture.fs.writtenFiles).toEqual([]);

		fixture.fs.setFile("/modules/acme/skills/module/SKILL.md", "module v2\n");
		const refreshed = await fixture.prepare(["pi"]);
		expect(refreshed).toMatchObject({ ok: true, value: { artifacts: [{ action: "refreshed" }] } });
		if (!refreshed.ok) return;
		const refreshApply = await applyPreparedDeclaredArtifactActivation(refreshed.value);
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
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);
		expect(applied).toMatchObject({ ok: true, completed: [{ action: "conflicted" }] });
		expect(fixture.fs.readText("/repo/.pi/skills/safe/SKILL.md")).toBe("local edit\n");
	});

	test("applies two artifacts sharing one harness manifest without clobbering entries", async () => {
		const fixture = createFixture([
			{
				moduleRoot: "/modules/acme",
				packageName: "@acme/ext",
				version: "1.0.0",
				descriptor: {
					description: "@acme/ext",
					bundledArtifacts: [
						{ kind: "skill", name: "alpha", path: "skills/alpha" },
						{ kind: "skill", name: "beta", path: "skills/beta" },
					],
				},
			},
		]);

		const prepared = await fixture.prepare(["pi"]);
		expect(prepared).toMatchObject({ ok: true });
		if (!prepared.ok) return;
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied).toMatchObject({
			ok: true,
			completed: [{ action: "installed" }, { action: "installed" }],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/alpha/SKILL.md")).toBe("alpha v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/beta/SKILL.md")).toBe("beta v1\n");
		expect(Object.keys(fixture.readManifest().artifacts)).toEqual([
			"pi:project:skill:@acme/ext:alpha",
			"pi:project:skill:@acme/ext:beta",
		]);
	});

	test("reports completed transitions when a later aggregate transition fails", async () => {
		const fixture = createFixture([
			{
				moduleRoot: "/modules/acme",
				packageName: "@acme/ext",
				version: "1.0.0",
				descriptor: {
					description: "@acme/ext",
					bundledArtifacts: [
						{ kind: "skill", name: "alpha", path: "skills/alpha" },
						{ kind: "skill", name: "beta", path: "skills/beta" },
					],
				},
			},
		]);
		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		fixture.fs.setFile("/modules/acme/skills/beta/SKILL.md", "changed after prepare\n");

		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied).toMatchObject({
			ok: false,
			error: {
				code: "stale_prepared_reconciliation",
				completedTransitions: [{ type: "provision" }],
			},
			completed: [{ artifactId: "@acme/ext:alpha", action: "installed" }],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/alpha/SKILL.md")).toBe("alpha v1\n");
		expect(fixture.fs.readText("/repo/.pi/skills/beta/SKILL.md")).toBeUndefined();
	});

	test("refuses incoherent out-of-root manifest deletion authority", async () => {
		const fixture = createFixture([]);
		const manifest = staleManifest();
		const entry = manifest.artifacts["pi:project:skill:@gone/ext:old"];
		if (entry === undefined) return;
		entry.files["SKILL.md"] = {
			sourcePath: "skills/old/SKILL.md",
			targetPath: "/repo/customer-data/SKILL.md",
			contentHash: contentHashForText("old\n"),
		};
		fixture.writeManifest(manifest);

		const prepared = await fixture.prepare(["pi"]);

		expect(prepared).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		expect(fixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBe("old\n");
	});

	test("rechecks destructive path safety immediately before apply", async () => {
		const fixture = createFixture([]);
		fixture.writeManifest(staleManifest());
		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		fixture.fs.markUnsafeRemovalPath("/repo/.pi/skills/old/SKILL.md");

		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied).toMatchObject({
			ok: false,
			error: {
				code: "unsafe_manifest_entry",
				details: { path: "/repo/.pi/skills/old/SKILL.md" },
			},
			completed: [],
		});
		expect(fixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBe("old\n");
	});

	test("refuses an out-of-root obsolete file on a retained manifest entry", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		const installed = await fixture.prepare(["pi"]);
		if (!installed.ok) return;
		await applyPreparedDeclaredArtifactActivation(installed.value);
		const manifest = fixture.readManifest();
		const entry = manifest.artifacts["pi:project:skill:@acme/ext:module"];
		if (entry === undefined) return;
		entry.files["obsolete.md"] = {
			sourcePath: "skills/module/obsolete.md",
			targetPath: "/repo/customer-data/obsolete.md",
			contentHash: contentHashForText("customer data\n"),
		};
		fixture.fs.setFile("/repo/customer-data/obsolete.md", "customer data\n");
		fixture.writeManifest(manifest);

		const prepared = await fixture.prepare(["pi"]);

		expect(prepared).toMatchObject({
			ok: false,
			error: {
				code: "unsafe_manifest_entry",
				details: { path: "/repo/customer-data/obsolete.md" },
			},
		});
		expect(fixture.fs.readText("/repo/customer-data/obsolete.md")).toBe("customer data\n");
	});

	test("edited stale files conflict and prevent every prepared activation write", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		fixture.writeManifest(staleManifest());
		fixture.fs.setFile("/repo/.pi/skills/old/SKILL.md", "customer edit\n");
		fixture.fs.clearWrittenFiles();

		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		expect(prepared.value.artifacts).toMatchObject([
			{ action: "conflicted", removal: { reason: "removed-source" } },
			{ action: "installed" },
		]);
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied).toMatchObject({ ok: true, completed: [{ action: "conflicted" }] });
		expect(fixture.fs.writtenFiles).toEqual([]);
		expect(fixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBe("customer edit\n");
		expect(fixture.fs.readText("/repo/.pi/skills/module/SKILL.md")).toBeUndefined();
	});

	test("applies same-target identity replacement as one aggregate transition", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		const manifest = staleManifest();
		const old = manifest.artifacts["pi:project:skill:@gone/ext:old"];
		if (old === undefined) return;
		old.provisionName = "module";
		old.targetArtifactPath = "/repo/.pi/skills/module";
		old.files["SKILL.md"] = {
			sourcePath: "skills/old/SKILL.md",
			targetPath: "/repo/.pi/skills/module/SKILL.md",
			contentHash: contentHashForText("old\n"),
		};
		fixture.fs.setFile("/repo/.pi/skills/module/SKILL.md", "old\n");
		fixture.writeManifest(manifest);

		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		expect(prepared.value.artifacts).toMatchObject([
			{ action: "removed", removal: { reason: "same-target-replacement" } },
			{ action: "installed" },
		]);
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied.ok).toBe(true);
		expect(fixture.fs.readText("/repo/.pi/skills/module/SKILL.md")).toBe("module v1\n");
		expect(Object.keys(fixture.readManifest().artifacts)).toEqual([
			"pi:project:skill:@acme/ext:module",
		]);
	});

	test("deselection removes tracked files but retains untracked files and non-empty artifact dirs", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		const installed = await fixture.prepare(["pi"]);
		if (!installed.ok) return;
		await applyPreparedDeclaredArtifactActivation(installed.value);
		fixture.fs.setFile("/repo/.pi/skills/module/customer.txt", "keep\n");

		const prepared = await fixture.prepare([]);
		if (!prepared.ok) return;
		expect(prepared.value.artifacts).toMatchObject([
			{ action: "removed", removal: { reason: "deselected-harness" } },
		]);
		await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(fixture.fs.readText("/repo/.pi/skills/module/SKILL.md")).toBeUndefined();
		expect(fixture.fs.readText("/repo/.pi/skills/module/customer.txt")).toBe("keep\n");
		expect(fixture.fs.nodes.get("/repo/.pi/skills/module")).toEqual({ type: "directory" });
	});

	test("removes unchanged stale manifest entries while adding declared artifacts", async () => {
		const fixture = createFixture([moduleFacts("/modules/acme", "@acme/ext", "module")]);
		fixture.writeManifest(staleManifest());

		const prepared = await fixture.prepare(["pi"]);
		if (!prepared.ok) return;
		const applied = await applyPreparedDeclaredArtifactActivation(prepared.value);

		expect(applied).toMatchObject({
			ok: true,
			completed: [{ action: "removed", removalReason: "removed-source" }, { action: "installed" }],
		});
		expect(Object.keys(fixture.readManifest().artifacts)).toEqual([
			"pi:project:skill:@acme/ext:module",
		]);
		expect(fixture.fs.readText("/repo/.pi/skills/old/SKILL.md")).toBeUndefined();
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
		for (const declaration of module.descriptor.bundledArtifacts ?? []) {
			if (declaration.kind === "skill") {
				files[join(module.moduleRoot, declaration.path, "SKILL.md")] = `${declaration.name} v1\n`;
			}
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
