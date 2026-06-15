import { describe, expect, test } from "vitest";

import { FakeObjectiveStorageGateway } from "../../src/fake-storage.ts";
import {
	ObjectiveStorage,
	activeRecordRelativePath,
	activeRootRelativePath,
	archiveRootRelativePath,
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
		for (const slug of ["", ".", "..", "foo/bar", ".asdl/objectives/foo", "foo\\bar"]) {
			expect(isValidObjectiveSlug(slug)).toBe(false);
		}
	});

	test("constructs checked-in storage paths", () => {
		expect(activeRootRelativePath()).toBe(".asdl/objectives");
		expect(activeRecordRelativePath("alpha")).toBe(".asdl/objectives/alpha");
		expect(archiveRootRelativePath()).toBe(".asdl/objective-archive");
		expect(archivedRecordRelativePath("alpha")).toBe(".asdl/objective-archive/alpha");
	});

	test("checkout inventory includes direct child directories sorted and detects direct closed marker", async () => {
		const fake = new FakeObjectiveStorageGateway({
			directories: [".asdl/objectives/zeta", ".asdl/objectives/alpha", ".asdl/objective-archive/archived"],
			files: {
				".asdl/objectives/alpha/closed.md": "closed\n",
				".asdl/objectives/zeta/updates/closed.md": "not a marker\n",
				".asdl/objectives/.gitkeep": "",
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
		await expect(storage(new FakeObjectiveStorageGateway()).checkoutInventory()).resolves.toEqual({ ok: true, value: { records: [] } });
		await expect(storage(new FakeObjectiveStorageGateway({ files: { ".asdl/objectives": "not a directory\n" } })).checkoutInventory()).resolves.toEqual({
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
			value: { objective_md: true, roadmap_md: true, updates_dir: true, closed_md: true },
		});
		if (!presence.ok) throw new Error("unexpected storage failure");
		expect(renderFilePresence(presence.value)).toBe("objective.md:yes, roadmap.md:yes, updates/:yes, closed.md:yes");
		await expect(objectiveStorage.listUpdateFiles(recordPath)).resolves.toEqual({
			ok: true,
			value: [
				{ name: "alpha.md", path: ".asdl/objectives/alpha/updates/alpha.md" },
				{ name: "zeta.md", path: ".asdl/objectives/alpha/updates/zeta.md" },
			],
		});
	});

	test("reads markdown files as raw text and treats missing directories as missing", async () => {
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({ directories: ["directory"], files: { "objective.md": "# hello\n" } }),
		);

		await expect(objectiveStorage.readMarkdownFile("objective.md")).resolves.toEqual({ type: "ok", content: "# hello\n" });
		await expect(objectiveStorage.readMarkdownFile("missing.md")).resolves.toEqual({ type: "missing" });
		await expect(objectiveStorage.readMarkdownFile("directory")).resolves.toEqual({ type: "missing" });
	});

	test("extracts Objective slugs from active record child paths only", () => {
		expect(objectiveSlugFromActivePath(".asdl/objectives/alpha/objective.md")).toBe("alpha");
		expect(objectiveSlugFromActivePath(".asdl/objectives/alpha/updates/one.md")).toBe("alpha");
		for (const path of [
			".asdl/objectives",
			".asdl/objectives/alpha",
			".asdl/objectives/../objective.md",
			".asdl/objectives//objective.md",
			".asdl/objective-archive/alpha/objective.md",
			"README.md",
		]) {
			expect(objectiveSlugFromActivePath(path)).toBeNull();
		}
	});
});
