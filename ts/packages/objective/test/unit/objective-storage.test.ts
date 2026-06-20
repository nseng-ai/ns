import { describe, expect, test } from "vitest";

import { FakeObjectiveStorageGateway } from "../../src/fake-storage.ts";
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
} from "../../src/storage.ts";

function storage(fake: FakeObjectiveStorageGateway): ObjectiveStorage {
	return new ObjectiveStorage(fake);
}

describe("Objective storage", () => {
	test("validates single-slug Objective identities", () => {
		expect(isValidObjectiveSlug("alpha")).toBe(true);
		expect(isValidObjectiveSlug("objective-archive-move-command")).toBe(true);
		expect(isValidObjectiveSlug("foo.bar")).toBe(true);
		for (const slug of ["", ".", "..", "foo/bar", ".sdl/objectives/foo", "foo\\bar"]) {
			expect(isValidObjectiveSlug(slug)).toBe(false);
		}
	});

	test("constructs checked-in storage paths", () => {
		expect(activeRootRelativePath()).toBe(".sdl/objectives");
		expect(activeRecordRelativePath("alpha")).toBe(".sdl/objectives/alpha");
		expect(archiveRootRelativePath()).toBe(".sdl/objective-archive");
		expect(archivedRecordRelativePath("alpha")).toBe(".sdl/objective-archive/alpha");
		expect(archiveSourceRelativePath("alpha", "archive")).toBe(".sdl/objectives/alpha");
		expect(archiveDestinationRelativePath("alpha", "archive")).toBe(".sdl/objective-archive/alpha");
		expect(archiveSourceRelativePath("alpha", "unarchive")).toBe(".sdl/objective-archive/alpha");
		expect(archiveDestinationRelativePath("alpha", "unarchive")).toBe(".sdl/objectives/alpha");
		expect(archiveEmptySourceRelativePath("archive")).toBe(".sdl/objectives");
		expect(archiveEmptyDestinationRelativePath("archive")).toBe(".sdl/objective-archive");
	});

	test("checkout inventory includes direct child directories sorted and detects direct closed marker", async () => {
		const fake = new FakeObjectiveStorageGateway({
			directories: [
				".sdl/objectives/zeta",
				".sdl/objectives/alpha",
				".sdl/objective-archive/archived",
			],
			files: {
				".sdl/objectives/alpha/closed.md": "closed\n",
				".sdl/objectives/zeta/updates/closed.md": "not a marker\n",
				".sdl/objectives/.gitkeep": "",
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
				new FakeObjectiveStorageGateway({ files: { ".sdl/objectives": "not a directory\n" } }),
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
				{ name: "alpha.md", path: ".sdl/objectives/alpha/updates/alpha.md" },
				{ name: "zeta.md", path: ".sdl/objectives/alpha/updates/zeta.md" },
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
		await expect(fake.pathKind(".sdl/objectives/alpha")).resolves.toEqual({
			ok: true,
			value: "missing",
		});
		await expect(fake.pathKind(".sdl/objective-archive")).resolves.toEqual({
			ok: true,
			value: "directory",
		});
		await expect(fake.pathKind(".sdl/objective-archive/alpha")).resolves.toEqual({
			ok: true,
			value: "directory",
		});
		await expect(fake.readTextFile(".sdl/objective-archive/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "# alpha\n",
		});
	});

	test("fake move refuses destination collisions without merging", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ slug: "alpha" }],
			files: {
				".sdl/objectives/alpha/objective.md": "active sentinel\n",
				".sdl/objective-archive/alpha/objective.md": "archived sentinel\n",
			},
		});
		const objectiveStorage = storage(fake);

		const moved = await objectiveStorage.moveRecord(objectiveStorage.movePaths("alpha", "archive"));

		expect(moved.ok).toBe(false);
		await expect(fake.readTextFile(".sdl/objectives/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "active sentinel\n",
		});
		await expect(fake.readTextFile(".sdl/objective-archive/alpha/objective.md")).resolves.toEqual({
			type: "ok",
			content: "archived sentinel\n",
		});
	});

	test("extracts Objective slugs from active record child paths only", () => {
		expect(objectiveSlugFromActivePath(".sdl/objectives/alpha/objective.md")).toBe("alpha");
		expect(objectiveSlugFromActivePath(".sdl/objectives/alpha/updates/one.md")).toBe("alpha");
		for (const path of [
			".sdl/objectives",
			".sdl/objectives/alpha",
			".sdl/objectives/../objective.md",
			".sdl/objectives//objective.md",
			".sdl/objective-archive/alpha/objective.md",
			"README.md",
		]) {
			expect(objectiveSlugFromActivePath(path)).toBeNull();
		}
	});
});
