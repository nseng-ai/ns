import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";

import {
	copyPublishExtras,
	filesWithPublishExtras,
	publishExtrasManifestMetadata,
	validatePublishExtras,
} from "../src/public-packages/publish-extras.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("generic publish extras", () => {
	test("validates, copies, derives files, and retains only publish metadata", async () => {
		const fixture = await createFixture();
		await writeSkill(fixture.sourceRoot, "skills/demo", "demo");
		const extras = await validatePublishExtras({
			manifest: manifest([
				{ kind: "skill", name: "demo", sourcePath: "skills/demo", publishPath: "artifacts/demo" },
			]),
			sourceRoot: fixture.sourceRoot,
			publishRoot: fixture.publishRoot,
		});

		await copyPublishExtras(extras);

		expect(await readFile(join(fixture.publishRoot, "artifacts/demo/SKILL.md"), "utf8")).toContain(
			"name: demo",
		);
		expect(filesWithPublishExtras(["src"], extras)).toEqual(["src", "artifacts"]);
		expect(filesWithPublishExtras(["src", "artifacts"], extras)).toEqual(["src", "artifacts"]);
		expect(publishExtrasManifestMetadata(extras)).toEqual({
			ns: {
				publishExtras: [
					{ kind: "skill", name: "demo", sourcePath: "skills/demo", publishPath: "artifacts/demo" },
				],
			},
		});
	});

	test.each(["../outside", "/absolute", "skills/../outside", "C:/absolute"])(
		"rejects unsafe source path %s",
		async (sourcePath) => {
			const fixture = await createFixture();
			await expect(
				validatePublishExtras({
					manifest: manifest([
						{ kind: "skill", name: "demo", sourcePath, publishPath: "skills/demo" },
					]),
					sourceRoot: fixture.sourceRoot,
					publishRoot: fixture.publishRoot,
				}),
			).rejects.toThrow(/relative path|traversal|outside/u);
		},
	);

	test.each(["../outside", "/absolute", "skills/../outside", "C:/absolute"])(
		"rejects unsafe publish path %s",
		async (publishPath) => {
			const fixture = await createFixture();
			await writeSkill(fixture.sourceRoot, "skills/demo", "demo");
			await expect(
				validatePublishExtras({
					manifest: manifest([
						{ kind: "skill", name: "demo", sourcePath: "skills/demo", publishPath },
					]),
					sourceRoot: fixture.sourceRoot,
					publishRoot: fixture.publishRoot,
				}),
			).rejects.toThrow(/relative path|traversal|outside/u);
		},
	);

	test("rejects duplicate names and destinations", async () => {
		const fixture = await createFixture();
		await writeSkill(fixture.sourceRoot, "skills/one", "one");
		await writeSkill(fixture.sourceRoot, "skills/two", "two");
		await expect(
			validatePublishExtras({
				manifest: manifest([
					{ kind: "skill", name: "one", sourcePath: "skills/one", publishPath: "skills/one" },
					{ kind: "skill", name: "one", sourcePath: "skills/two", publishPath: "skills/two" },
				]),
				sourceRoot: fixture.sourceRoot,
				publishRoot: fixture.publishRoot,
			}),
		).rejects.toThrow("Duplicate publish extra name");
		await expect(
			validatePublishExtras({
				manifest: manifest([
					{ kind: "skill", name: "one", sourcePath: "skills/one", publishPath: "skills/shared" },
					{ kind: "skill", name: "two", sourcePath: "skills/two", publishPath: "skills/shared" },
				]),
				sourceRoot: fixture.sourceRoot,
				publishRoot: fixture.publishRoot,
			}),
		).rejects.toThrow("Duplicate publish extra destination");
	});

	test("rejects malformed metadata and noncanonical names", async () => {
		const fixture = await createFixture();
		await expect(
			validatePublishExtras({
				manifest: { ns: { publishExtras: "not-an-array" } },
				sourceRoot: fixture.sourceRoot,
				publishRoot: fixture.publishRoot,
			}),
		).rejects.toThrow("must be an array");
		for (const name of ["", "Demo", "demo_name", "-demo"]) {
			await expectValidationFailure(
				fixture,
				[{ kind: "skill", name, sourcePath: "skills/demo", publishPath: "skills/demo" }],
				"canonical kebab-case",
			);
		}
	});

	test("rejects frontmatter mismatch before touching the publish root", async () => {
		const fixture = await createFixture();
		await writeSkill(fixture.sourceRoot, "skills/demo", "other");
		await mkdir(fixture.publishRoot, { recursive: true });
		const sentinelPath = join(fixture.publishRoot, "sentinel.txt");
		await writeFile(sentinelPath, "untouched");
		await expect(
			validatePublishExtras({
				manifest: manifest([
					{ kind: "skill", name: "demo", sourcePath: "skills/demo", publishPath: "skills/demo" },
				]),
				sourceRoot: fixture.sourceRoot,
				publishRoot: fixture.publishRoot,
			}),
		).rejects.toThrow("does not equal declared name");
		expect(await readFile(sentinelPath, "utf8")).toBe("untouched");
	});

	test("rejects unsupported, missing, and malformed skill sources", async () => {
		const fixture = await createFixture();
		await expectValidationFailure(
			fixture,
			[{ kind: "prompt", name: "demo", sourcePath: "skills/demo", publishPath: "skills/demo" }],
			"supported kind",
		);
		await expectValidationFailure(
			fixture,
			[{ kind: "skill", name: "demo", sourcePath: "skills/missing", publishPath: "skills/demo" }],
			"does not exist",
		);
		await mkdir(join(fixture.sourceRoot, "skills/malformed"), { recursive: true });
		await writeFile(join(fixture.sourceRoot, "skills/malformed/SKILL.md"), "not frontmatter\n");
		await expectValidationFailure(
			fixture,
			[
				{
					kind: "skill",
					name: "malformed",
					sourcePath: "skills/malformed",
					publishPath: "skills/malformed",
				},
			],
			"must start with frontmatter",
		);
	});

	test("a package with no extras is unchanged", async () => {
		const fixture = await createFixture();
		const extras = await validatePublishExtras({
			manifest: { ns: { tier: "capability" } },
			sourceRoot: fixture.sourceRoot,
			publishRoot: fixture.publishRoot,
		});
		expect(extras).toEqual([]);
		expect(filesWithPublishExtras(["src"], extras)).toEqual(["src"]);
		expect(publishExtrasManifestMetadata(extras)).toEqual({});
		await copyPublishExtras(extras);
	});
});

interface RawExtra {
	readonly kind: string;
	readonly name: string;
	readonly sourcePath: string;
	readonly publishPath: string;
}

function manifest(publishExtras: readonly RawExtra[]) {
	return { ns: { tier: "capability", subpackages: ["internal"], publishExtras } };
}

async function createFixture() {
	const root = await mkdtemp(join(tmpdir(), "ns-publish-extras-"));
	temporaryRoots.push(root);
	const sourceRoot = join(root, "source");
	const publishRoot = join(root, "publish");
	await mkdir(sourceRoot, { recursive: true });
	return { sourceRoot, publishRoot };
}

async function writeSkill(sourceRoot: string, relativePath: string, name: string) {
	const root = join(sourceRoot, relativePath);
	await mkdir(root, { recursive: true });
	await writeFile(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`);
}

async function expectValidationFailure(
	fixture: { sourceRoot: string; publishRoot: string },
	extras: readonly RawExtra[],
	message: string,
) {
	await expect(
		validatePublishExtras({
			manifest: manifest(extras),
			sourceRoot: fixture.sourceRoot,
			publishRoot: fixture.publishRoot,
		}),
	).rejects.toThrow(message);
}
