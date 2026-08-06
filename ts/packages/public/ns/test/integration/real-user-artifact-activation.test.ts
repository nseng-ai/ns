import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import { afterEach, describe, expect, test } from "vitest";

import { RealUserArtifactActivationGateway } from "../../src/init/real-user-artifact-activation.ts";

const tempRoots: string[] = [];

const manifestName = ".ns-harness-artifacts-manifest.json";

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
	tempRoots.length = 0;
});

describe("RealUserArtifactActivationGateway", () => {
	test("provisions one bundled skill to every configured user harness root with owned manifests", async () => {
		const fixture = await createFixture();
		const descriptor = await createSkillDescriptor(fixture.root, "tools", "demo");

		const prepared = await fixture.gateway.prepare({
			cwd: fixture.invocation,
			descriptors: [descriptor],
			configuredHarnesses: ["claude-code", "codex", "pi"],
			targetPackageNames: [descriptor.packageName],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await fixture.gateway.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);

		expect(applied.completed).toHaveLength(3);
		for (const [harness, skillRoot] of Object.entries(fixture.skillRoots)) {
			expect(await readFile(join(skillRoot, "demo/SKILL.md"), "utf8")).toBe("# demo\n");
			const manifest = JSON.parse(await readFile(join(skillRoot, manifestName), "utf8")) as {
				artifacts: Record<
					string,
					{ scope: string; harness: string; source: { packageName: string } }
				>;
			};
			expect(Object.values(manifest.artifacts)).toEqual([
				expect.objectContaining({
					scope: "user",
					harness,
					source: expect.objectContaining({ packageName: "@test/tools" }),
				}),
			]);
		}
	});

	test("an absent configured harness set writes no user artifacts", async () => {
		const fixture = await createFixture();
		const descriptor = await createSkillDescriptor(fixture.root, "tools", "demo");

		const prepared = await fixture.gateway.prepare({
			cwd: fixture.invocation,
			descriptors: [descriptor],
			configuredHarnesses: [],
			targetPackageNames: [descriptor.packageName],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await fixture.gateway.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);

		expect(applied.completed).toEqual([]);
		for (const skillRoot of Object.values(fixture.skillRoots)) await expectMissing(skillRoot);
	});

	test("a configured-set update removes deselected roots only for the targeted package", async () => {
		const fixture = await createFixture();
		const tools = await createSkillDescriptor(fixture.root, "tools", "tools-skill");
		const other = await createSkillDescriptor(fixture.root, "other", "other-skill");
		await reconcile(
			fixture.gateway,
			fixture.invocation,
			[tools, other],
			["claude-code", "codex", "pi"],
			[tools.packageName, other.packageName],
		);

		await reconcile(fixture.gateway, fixture.invocation, [tools], ["pi"], [tools.packageName]);

		await expectMissing(join(fixture.skillRoots["claude-code"], "tools-skill/SKILL.md"));
		await expectMissing(join(fixture.skillRoots.codex, "tools-skill/SKILL.md"));
		expect(await readFile(join(fixture.skillRoots.pi, "tools-skill/SKILL.md"), "utf8")).toBe(
			"# tools-skill\n",
		);
		for (const skillRoot of Object.values(fixture.skillRoots)) {
			expect(await readFile(join(skillRoot, "other-skill/SKILL.md"), "utf8")).toBe(
				"# other-skill\n",
			);
		}
	});

	test("edited tracked files block identifiable removal while untracked files survive safe removal", async () => {
		const fixture = await createFixture();
		const descriptor = await createSkillDescriptor(fixture.root, "tools", "demo");
		await reconcile(
			fixture.gateway,
			fixture.invocation,
			[descriptor],
			["pi"],
			[descriptor.packageName],
		);
		const skillRoot = fixture.skillRoots.pi;
		const tracked = join(skillRoot, "demo/SKILL.md");
		await writeFile(tracked, "# local edit\n", "utf8");

		const blocked = await fixture.gateway.prepare({
			cwd: fixture.invocation,
			descriptors: [],
			configuredHarnesses: ["pi"],
			targetPackageNames: [descriptor.packageName],
		});
		if (!blocked.ok) throw new Error(blocked.error.message);
		expect(blocked.prepared.reconciliation.items).toEqual([
			expect.objectContaining({ conflictingFiles: [tracked] }),
		]);
		expect(await readFile(tracked, "utf8")).toBe("# local edit\n");

		await writeFile(tracked, "# demo\n", "utf8");
		const untracked = join(skillRoot, "demo/notes.txt");
		await writeFile(untracked, "keep me\n", "utf8");
		await reconcile(fixture.gateway, fixture.invocation, [], ["pi"], [descriptor.packageName]);

		await expectMissing(tracked);
		expect(await readFile(untracked, "utf8")).toBe("keep me\n");
	});
});

async function createFixture() {
	const root = await mkdtemp(join(tmpdir(), "ns-user-artifacts-"));
	tempRoots.push(root);
	const home = join(root, "home");
	const claudeConfig = join(root, "claude-config");
	const invocation = join(root, "invocation");
	await mkdir(invocation, { recursive: true });
	return {
		root,
		invocation,
		gateway: new RealUserArtifactActivationGateway({
			homeDir: home,
			env: { CLAUDE_CONFIG_DIR: claudeConfig },
		}),
		skillRoots: {
			"claude-code": join(claudeConfig, "skills"),
			codex: join(home, ".agents/skills"),
			pi: join(home, ".pi/agent/skills"),
		},
	};
}

async function createSkillDescriptor(
	root: string,
	packageSlug: string,
	skillName: string,
): Promise<DeclaredExtensionDescriptor> {
	const moduleRoot = join(root, `extension-${packageSlug}`);
	await mkdir(join(moduleRoot, "skills", skillName), { recursive: true });
	await writeFile(join(moduleRoot, "skills", skillName, "SKILL.md"), `# ${skillName}\n`, "utf8");
	return {
		spec: moduleRoot,
		sourceKind: "local",
		moduleRoot,
		descriptorPath: join(moduleRoot, "extension.ts"),
		packageName: `@test/${packageSlug}`,
		version: "1.0.0",
		descriptor: {
			description: packageSlug,
			bundledArtifacts: [{ kind: "skill", name: skillName, path: `skills/${skillName}` }],
		},
	};
}

async function reconcile(
	gateway: RealUserArtifactActivationGateway,
	cwd: string,
	descriptors: readonly DeclaredExtensionDescriptor[],
	configuredHarnesses: readonly ("claude-code" | "codex" | "pi")[],
	targetPackageNames: readonly string[],
): Promise<void> {
	const prepared = await gateway.prepare({
		cwd,
		descriptors,
		configuredHarnesses,
		targetPackageNames,
	});
	if (!prepared.ok) throw new Error(prepared.error.message);
	const applied = await gateway.apply(prepared.prepared);
	if (!applied.ok) throw new Error(applied.error.message);
}

async function expectMissing(path: string): Promise<void> {
	await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}
