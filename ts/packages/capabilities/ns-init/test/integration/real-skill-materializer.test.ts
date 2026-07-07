import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { INSTALL_MANIFEST_FILE_NAME } from "@nseng-ai/harness-artifacts/api";

import { RealSkillMaterializer } from "../../src/real-skill-materializer.ts";

interface InstallManifest {
	version: 1;
	artifacts: Record<
		string,
		{
			artifactId: string;
			provisionName: string;
			targetArtifactPath: string;
			files: Record<string, { contentHash: string; targetPath: string }>;
		}
	>;
}

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
	tempRoots.length = 0;
});

describe("RealSkillMaterializer", () => {
	test("materializes the catalog objective skill through harness-artifacts provisioning", async () => {
		const fixture = await createFixture();
		const materializer = new RealSkillMaterializer({
			context: { userHomeDir: fixture.homeDir, env: {} },
		});

		const result = await materializer.materializeObjectiveSkills({
			repoRoot: fixture.repoRoot,
			harnesses: ["claude-code", "codex", "pi"],
		});

		expect(result).toEqual({
			type: "materialized",
			installedSkillPaths: [
				join(fixture.repoRoot, ".claude/skills/objective"),
				join(fixture.repoRoot, ".agents/skills/objective"),
				join(fixture.repoRoot, ".pi/skills/objective"),
			],
		});
		for (const skillRoot of [".claude/skills", ".agents/skills", ".pi/skills"]) {
			await expect(
				readFile(join(fixture.repoRoot, skillRoot, "objective/SKILL.md"), "utf8"),
			).resolves.toContain("objective");
		}

		const claudeManifest = await readManifest(
			join(fixture.repoRoot, ".claude/skills", INSTALL_MANIFEST_FILE_NAME),
		);
		expect(claudeManifest.artifacts["claude-code:project:skill:objective-skill"]).toMatchObject({
			artifactId: "objective-skill",
			provisionName: "objective",
			targetArtifactPath: join(fixture.repoRoot, ".claude/skills/objective"),
		});
	});

	test("refuses to clobber locally edited skill targets", async () => {
		const fixture = await createFixture();
		const targetSkill = join(fixture.repoRoot, ".pi/skills/objective/SKILL.md");
		await writeTextFile(targetSkill, "local edit\n");
		const materializer = new RealSkillMaterializer({
			context: { userHomeDir: fixture.homeDir, env: {} },
		});

		const result = await materializer.materializeObjectiveSkills({
			repoRoot: fixture.repoRoot,
			harnesses: ["pi"],
		});

		expect(result).toMatchObject({
			type: "error",
			error: {
				code: "locally-edited-conflict",
				details: { harness: "pi", conflictingFiles: [targetSkill] },
			},
		});
		await expect(readFile(targetSkill, "utf8")).resolves.toBe("local edit\n");
		await expect(
			readFile(join(fixture.repoRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});

async function createFixture() {
	const root = await mkdtemp(join(tmpdir(), "ns-init-skills-"));
	tempRoots.push(root);
	const repoRoot = join(root, "repo");
	const homeDir = join(root, "home");
	await mkdir(repoRoot, { recursive: true });
	await mkdir(homeDir, { recursive: true });
	return { repoRoot, homeDir };
}

async function readManifest(path: string): Promise<InstallManifest> {
	return JSON.parse(await readFile(path, "utf8")) as InstallManifest;
}

async function writeTextFile(path: string, text: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text, "utf8");
}
