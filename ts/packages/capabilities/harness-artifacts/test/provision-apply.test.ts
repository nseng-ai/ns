import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { SkillHarnessArtifactEntry } from "../src/artifact-catalog.ts";
import {
	applyHarnessArtifactProvision,
	applyPreparedProvision,
	contentHashForBytes,
	contentHashForText,
	INSTALL_MANIFEST_FILE_NAME,
	prepareProvision,
	previewHarnessArtifactProvision,
	type InstallManifestData,
} from "../src/index.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

const skillArtifact = {
	kind: "skill",
	id: "objective-next-skill",
	name: "Objective next skill",
	description: "Objective workflow instructions.",
	skillName: "objective-next",
	source: {
		type: "first-party",
		packageName: "@nseng-ai/ns",
		relativePath: "skills/objective-next",
	},
} as const satisfies SkillHarnessArtifactEntry;

const tempRoots: string[] = [];
const binaryAssetBytes = Buffer.from([0, 159, 255, 10]);

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
	tempRoots.length = 0;
});

describe("harness artifact provision apply", () => {
	test("fresh install copies skill files and writes the install manifest", async () => {
		const fixture = await createFixture();

		const result = await applyHarnessArtifactProvision(fixture.request());

		expect(result).toMatchObject({ ok: true, value: { outcome: "applied" } });
		if (!result.ok || result.value.outcome !== "applied") return;
		expect(result.value.writtenFiles).toEqual([
			join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md"),
			join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin"),
			join(fixture.projectRoot, ".pi/skills/objective-next/references/guide.md"),
		]);
		await expect(
			readFile(join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md"), "utf8"),
		).resolves.toBe("skill instructions\n");
		await expect(
			readFile(join(fixture.projectRoot, ".pi/skills/objective-next/references/guide.md"), "utf8"),
		).resolves.toBe("reference guide\n");
		await expect(
			readFile(join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin")),
		).resolves.toEqual(binaryAssetBytes);

		const manifest = await readManifest(
			join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME),
		);
		expect(manifest).toEqual({
			version: 1,
			artifacts: {
				"pi:project:skill:objective-next-skill": {
					artifactId: "objective-next-skill",
					kind: "skill",
					provisionName: "objective-next",
					harness: "pi",
					scope: "project",
					targetRoot: join(fixture.projectRoot, ".pi/skills"),
					targetArtifactPath: join(fixture.projectRoot, ".pi/skills/objective-next"),
					source: {
						type: "first-party",
						packageName: "@nseng-ai/ns",
						relativePath: "skills/objective-next",
						version: "git:test",
					},
					files: {
						"SKILL.md": {
							sourcePath: "skills/objective-next/SKILL.md",
							targetPath: join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md"),
							contentHash: contentHashForText("skill instructions\n"),
						},
						"assets/icon.bin": {
							sourcePath: "skills/objective-next/assets/icon.bin",
							targetPath: join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin"),
							contentHash: contentHashForBytes(binaryAssetBytes),
						},
						"references/guide.md": {
							sourcePath: "skills/objective-next/references/guide.md",
							targetPath: join(
								fixture.projectRoot,
								".pi/skills/objective-next/references/guide.md",
							),
							contentHash: contentHashForText("reference guide\n"),
						},
					},
				},
			},
		});
	});

	test("re-apply unchanged is idempotent", async () => {
		const fixture = await createFixture();
		const first = await applyHarnessArtifactProvision(fixture.request());
		expect(first).toMatchObject({ ok: true });
		const manifestPath = join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME);
		const firstManifestText = await readFile(manifestPath, "utf8");

		const second = await applyHarnessArtifactProvision(fixture.request());

		expect(second).toMatchObject({ ok: true, value: { outcome: "applied" } });
		if (!second.ok || second.value.outcome !== "applied") return;
		expect(second.value.decisions.files.map((decision) => decision.type)).toEqual([
			"unchanged",
			"unchanged",
			"unchanged",
		]);
		expect(second.value.writtenFiles).toEqual([]);
		await expect(readFile(manifestPath, "utf8")).resolves.toBe(firstManifestText);
	});

	test("locally edited target without force refuses and touches nothing", async () => {
		const fixture = await createFixture();
		const targetSkill = join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md");
		await writeTextFile(targetSkill, "local edit\n");
		const missingTarget = join(
			fixture.projectRoot,
			".pi/skills/objective-next/references/guide.md",
		);
		const manifestPath = join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME);

		const result = await applyHarnessArtifactProvision(fixture.request());

		expect(result).toMatchObject({
			ok: true,
			value: { outcome: "conflicted", conflictingFiles: [targetSkill] },
		});
		await expect(readFile(targetSkill, "utf8")).resolves.toBe("local edit\n");
		await expect(readFile(missingTarget, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(manifestPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("force overwrites locally edited targets and updates the manifest", async () => {
		const fixture = await createFixture();
		const targetSkill = join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md");
		await writeTextFile(targetSkill, "local edit\n");

		const prepared = await prepareProvision(fixture.request());
		expect(prepared).toMatchObject({ ok: true });
		if (!prepared.ok) return;

		const result = await applyPreparedProvision(prepared.value, { shouldForce: true });

		expect(result).toMatchObject({ ok: true, value: { outcome: "applied" } });
		if (!result.ok || result.value.outcome !== "applied") return;
		expect(result.value.decisions.files.map((decision) => decision.type)).toEqual([
			"locally-edited-conflict",
			"fresh-write",
			"fresh-write",
		]);
		expect(result.value.writtenFiles).toEqual([
			targetSkill,
			join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin"),
			join(fixture.projectRoot, ".pi/skills/objective-next/references/guide.md"),
		]);
		await expect(readFile(targetSkill, "utf8")).resolves.toBe("skill instructions\n");
		const manifest = await readManifest(
			join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME),
		);
		expect(
			manifest.artifacts["pi:project:skill:objective-next-skill"]?.files["SKILL.md"],
		).toMatchObject({ contentHash: contentHashForText("skill instructions\n") });
	});

	test("applies through an injected fake filesystem gateway", async () => {
		const fixture = await createFixture();
		const sourceSkill = join(fixture.sourceRoot, "skills/objective-next/SKILL.md");
		const sourceGuide = join(fixture.sourceRoot, "skills/objective-next/references/guide.md");
		const sourceIcon = join(fixture.sourceRoot, "skills/objective-next/assets/icon.bin");
		const textEncoder = new TextEncoder();
		const textDecoder = new TextDecoder();
		const fakeFs = new InMemoryHarnessFs({
			[sourceSkill]: "skill\n",
			[sourceGuide]: "guide\n",
			[sourceIcon]: { type: "file", bytes: Uint8Array.from(binaryAssetBytes) },
		});

		const result = await applyHarnessArtifactProvision({ ...fixture.request(), fs: fakeFs });

		expect(result).toMatchObject({ ok: true, value: { outcome: "applied" } });
		if (!result.ok || result.value.outcome !== "applied") return;
		expect(result.value.writtenFiles).toEqual([
			join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md"),
			join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin"),
			join(fixture.projectRoot, ".pi/skills/objective-next/references/guide.md"),
		]);
		expect(
			fakeFs.readBytes(join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md")),
		).toEqual(textEncoder.encode("skill\n"));
		expect(
			fakeFs.readBytes(join(fixture.projectRoot, ".pi/skills/objective-next/assets/icon.bin")),
		).toEqual(Uint8Array.from(binaryAssetBytes));
		expect(
			textDecoder.decode(
				fakeFs.readBytes(join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME)),
			),
		).toContain("pi:project:skill:objective-next-skill");
	});

	test("preview returns the plan and classifications without writing", async () => {
		const fixture = await createFixture();

		const result = await previewHarnessArtifactProvision(fixture.request());

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.plan.targetRoot).toBe(join(fixture.projectRoot, ".pi/skills"));
		expect(result.value.decisions.files.map((decision) => decision.type)).toEqual([
			"fresh-write",
			"fresh-write",
			"fresh-write",
		]);
		await expect(
			readFile(join(fixture.projectRoot, ".pi/skills/objective-next/SKILL.md"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			readFile(join(fixture.projectRoot, ".pi/skills", INSTALL_MANIFEST_FILE_NAME), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});

async function createFixture() {
	const root = await mkdtemp(join(tmpdir(), "harness-artifacts-"));
	tempRoots.push(root);
	const sourceRoot = join(root, "source");
	const projectRoot = join(root, "project");
	const homeDir = join(root, "home");
	await writeTextFile(join(sourceRoot, "skills/objective-next/SKILL.md"), "skill instructions\n");
	await writeTextFile(
		join(sourceRoot, "skills/objective-next/references/guide.md"),
		"reference guide\n",
	);
	await writeBinaryFile(
		join(sourceRoot, "skills/objective-next/assets/icon.bin"),
		binaryAssetBytes,
	);
	return {
		sourceRoot,
		projectRoot,
		homeDir,
		request() {
			return {
				artifact: skillArtifact,
				harness: "pi",
				scope: "project" as const,
				context: { projectRoot, homeDir },
				sourceRoot,
				sourceVersion: "git:test",
			};
		},
	};
}

async function readManifest(path: string): Promise<InstallManifestData> {
	return JSON.parse(await readFile(path, "utf8")) as InstallManifestData;
}

async function writeTextFile(path: string, text: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text, "utf8");
}

async function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
}
