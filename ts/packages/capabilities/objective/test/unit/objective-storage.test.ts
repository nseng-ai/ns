import { describe, expect, test } from "vitest";

import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import {
	ObjectiveStorage,
	activeRecordRelativePath,
	activeRootRelativePath,
	archiveDestinationRelativePath,
	archiveEmptyDestinationRelativePath,
	archiveEmptySourceRelativePath,
	archiveRootRelativePath,
	archiveSourceRelativePath,
	archivedRecordRelativePath,
	isValidObjectiveSlug,
	objectiveSlugFromActivePath,
	renderFilePresence,
} from "../../src/core/storage.ts";

function storage(fake: FakeObjectiveStorageGateway): ObjectiveStorage {
	return new ObjectiveStorage(fake);
}

describe("Objective storage", () => {
	test("validates single-slug Objective identities", () => {
		expect(isValidObjectiveSlug("alpha")).toBe(true);
		expect(isValidObjectiveSlug("objective-archive-move-command")).toBe(true);
		expect(isValidObjectiveSlug("foo.bar")).toBe(true);
		for (const slug of ["", ".", "..", "foo/bar", ".ji/objectives/foo", "foo\\bar"]) {
			expect(isValidObjectiveSlug(slug)).toBe(false);
		}
	});

	test("constructs checked-in storage paths", () => {
		expect(activeRootRelativePath()).toBe(".ji/objectives");
		expect(activeRecordRelativePath("alpha")).toBe(".ji/objectives/alpha");
		expect(archiveRootRelativePath()).toBe(".ji/objective-archive");
		expect(archivedRecordRelativePath("alpha")).toBe(".ji/objective-archive/alpha");
		expect(archiveSourceRelativePath("alpha", "archive")).toBe(".ji/objectives/alpha");
		expect(archiveDestinationRelativePath("alpha", "archive")).toBe(".ji/objective-archive/alpha");
		expect(archiveSourceRelativePath("alpha", "unarchive")).toBe(".ji/objective-archive/alpha");
		expect(archiveDestinationRelativePath("alpha", "unarchive")).toBe(".ji/objectives/alpha");
		expect(archiveEmptySourceRelativePath("archive")).toBe(".ji/objectives");
		expect(archiveEmptyDestinationRelativePath("archive")).toBe(".ji/objective-archive");
	});

	test("checkout inventory includes direct child directories sorted and detects direct closed marker", async () => {
		const fake = new FakeObjectiveStorageGateway({
			directories: [
				".ji/objectives/zeta",
				".ji/objectives/alpha",
				".ji/objective-archive/archived",
			],
			files: {
				".ji/objectives/alpha/closed.md": "closed\n",
				".ji/objectives/zeta/updates/closed.md": "not a marker\n",
				".ji/objectives/.gitkeep": "",
			},
		});

		await expect(storage(fake).checkoutInventory()).resolves.toEqual({
			ok: true,
			value: {
				records: [
					{ slug: "alpha", status: "closed" },
					{ slug: "zeta", status: "open" },
				],
			},
		});
	});

	test("missing or non-directory active root returns empty inventory", async () => {
		await expect(storage(new FakeObjectiveStorageGateway()).checkoutInventory()).resolves.toEqual({
			ok: true,
			value: { records: [] },
		});
		await expect(
			storage(
				new FakeObjectiveStorageGateway({ files: { ".ji/objectives": "not a directory\n" } }),
			).checkoutInventory(),
		).resolves.toEqual({
			ok: true,
			value: { records: [] },
		});
	});

	test("reports file presence and direct sorted update markdown files", async () => {
		const recordPath = activeRecordRelativePath("alpha");
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({
				directories: [recordPath, `${recordPath}/updates`, `${recordPath}/updates/nested`],
				files: {
					[`${recordPath}/objective.md`]: "# objective\n",
					[`${recordPath}/roadmap.md`]: "# roadmap\n",
					[`${recordPath}/closed.md`]: "closed\n",
					[`${recordPath}/updates/zeta.md`]: "# zeta\n",
					[`${recordPath}/updates/alpha.md`]: "# alpha\n",
					[`${recordPath}/updates/notes.txt`]: "ignore\n",
					[`${recordPath}/updates/nested/nested.md`]: "ignore\n",
				},
			}),
		);

		const presence = await objectiveStorage.filePresence(recordPath);
		expect(presence).toEqual({
			ok: true,
			value: { objectiveMd: true, roadmapMd: true, updatesDir: true, closedMd: true },
		});
		if (!presence.ok) throw new Error("unexpected storage failure");
		expect(renderFilePresence(presence.value)).toBe(
			"objective.md:yes, roadmap.md:yes, updates/:yes, closed.md:yes",
		);
		await expect(objectiveStorage.listUpdateFiles(recordPath)).resolves.toEqual({
			ok: true,
			value: [
				{ name: "alpha.md", path: ".ji/objectives/alpha/updates/alpha.md" },
				{ name: "zeta.md", path: ".ji/objectives/alpha/updates/zeta.md" },
			],
		});
	});

	test("reads markdown files as raw text and treats missing directories as missing", async () => {
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({
				directories: ["directory"],
				files: { "objective.md": "# hello\n" },
			}),
		);

		await expect(objectiveStorage.readMarkdownFile("objective.md")).resolves.toEqual({
			type: "ok",
			content: "# hello\n",
		});
		await expect(objectiveStorage.readMarkdownFile("missing.md")).resolves.toEqual({
			type: "missing",
		});
		await expect(objectiveStorage.readMarkdownFile("directory")).resolves.toEqual({
			type: "missing",
		});
	});

	test("moves Objective record directories and creates destination parent", async () => {
		const fake = new FakeObjectiveStorageGateway({ records: [{ slug: "alpha" }] });
		const objectiveStorage = storage(fake);
		const paths = objectiveStorage.movePaths("alpha", "archive");

		await expect(objectiveStorage.moveRecord(paths)).resolves.toEqual({
			ok: true,
			value: undefined,
		});
		await expect(fake.pathKind(".ji/objectives/alpha")).resolves.toEqual({
			ok: true,
			value: "missing",
		});
		await expect(fake.pathKind(".ji/objective-archive")).resolves.toEqual({
			ok: true,
			value: "directory",
		});
		await expect(fake.pathKind(".ji/objective-archive/alpha")).resolves.toEqual({
			ok: true,
			value: "directory",
		});
		await expect(fake.readTextFile(".ji/objective-archive/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "# alpha\n",
		});
	});

	test("fake move refuses destination collisions without merging", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ slug: "alpha" }],
			files: {
				".ji/objectives/alpha/objective.md": "active sentinel\n",
				".ji/objective-archive/alpha/objective.md": "archived sentinel\n",
			},
		});
		const objectiveStorage = storage(fake);

		const moved = await objectiveStorage.moveRecord(objectiveStorage.movePaths("alpha", "archive"));

		expect(moved.ok).toBe(false);
		await expect(fake.readTextFile(".ji/objectives/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "active sentinel\n",
		});
		await expect(fake.readTextFile(".ji/objective-archive/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "archived sentinel\n",
		});
	});

	test("reads the record document through the shared Record Frontmatter reader", async () => {
		const frontmattered = [
			"---",
			"blocked: Gated on an upstream landing.",
			"edges: []",
			"---",
			"# alpha",
			"",
		].join("\n");
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{ slug: "alpha", objectiveMd: frontmattered },
				{ slug: "bravo", objectiveMd: "# bravo\n" },
			],
		});
		const objectiveStorage = storage(fake);

		await expect(
			objectiveStorage.readObjectiveRecordDocument(activeRecordRelativePath("alpha")),
		).resolves.toEqual({
			type: "ok",
			content: frontmattered,
			document: {
				frontmatter: {
					type: "frontmatter",
					frontmatter: { blocked: "Gated on an upstream landing.", edges: [] },
				},
				body: "# alpha\n",
			},
		});
		await expect(
			objectiveStorage.readObjectiveRecordDocument(activeRecordRelativePath("bravo")),
		).resolves.toEqual({
			type: "ok",
			content: "# bravo\n",
			document: { body: "# bravo\n" },
		});
	});

	test("record document reads propagate missing and unreadable objective.md", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ slug: "alpha", objectiveMd: null }, { slug: "bravo" }],
			unreadableFiles: { ".ji/objectives/bravo/objective.md": "permission denied" },
		});
		const objectiveStorage = storage(fake);

		await expect(
			objectiveStorage.readObjectiveRecordDocument(activeRecordRelativePath("alpha")),
		).resolves.toEqual({ type: "missing" });
		await expect(
			objectiveStorage.readObjectiveRecordDocument(activeRecordRelativePath("bravo")),
		).resolves.toEqual({ type: "unreadable", message: "permission denied" });
	});

	test("extracts Objective slugs from active record child paths only", () => {
		expect(objectiveSlugFromActivePath(".ji/objectives/alpha/objective.md")).toBe("alpha");
		expect(objectiveSlugFromActivePath(".ji/objectives/alpha/updates/one.md")).toBe("alpha");
		for (const path of [
			".ji/objectives",
			".ji/objectives/alpha",
			".ji/objectives/../objective.md",
			".ji/objectives//objective.md",
			".ji/objective-archive/alpha/objective.md",
			"README.md",
		]) {
			expect(objectiveSlugFromActivePath(path)).toBeNull();
		}
	});
});
