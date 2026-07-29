import { describe, expect, test } from "vitest";

import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import {
	isValidObjectiveLocator,
	isValidObjectiveOwner,
	parseObjectiveLocatorString,
	parseObjectiveSelector,
	renderObjectiveLocator,
} from "../../src/core/identity.ts";
import {
	ObjectiveStorage,
	activeRootRelativePath,
	isValidObjectiveSlug,
	legacyFlatRecordRelativePath,
	objectiveLocatorCandidatesFromActivePath,
	objectiveLocatorsFromChangedPaths,
	ownerNestedRecordRelativePath,
	renderFilePresence,
	type ObjectiveRecordLocation,
} from "../../src/core/storage.ts";

function storage(fake: FakeObjectiveStorageGateway): ObjectiveStorage {
	return new ObjectiveStorage(fake);
}

const OWNER = "tester";

function nestedPath(slug: string): string {
	return ownerNestedRecordRelativePath({ owner: OWNER, slug });
}

describe("Objective identity", () => {
	test("validates single-slug Objective identities", () => {
		expect(isValidObjectiveSlug("alpha")).toBe(true);
		expect(isValidObjectiveSlug("objective-deletion-cleanup")).toBe(true);
		expect(isValidObjectiveSlug("foo.bar")).toBe(true);
		for (const slug of ["", ".", "..", "foo/bar", ".ns/objectives/foo", "foo\\bar"]) {
			expect(isValidObjectiveSlug(slug)).toBe(false);
		}
	});

	test("validates owner handles offline", () => {
		expect(isValidObjectiveOwner("schrockn")).toBe(true);
		expect(isValidObjectiveOwner("a")).toBe(true);
		expect(isValidObjectiveOwner("my-handle-9")).toBe(true);
		expect(isValidObjectiveOwner("a".repeat(39))).toBe(true);
		for (const owner of [
			"",
			"@schrockn",
			"Schrockn",
			"-leading",
			"trailing-",
			"double--hyphen",
			"under_score",
			"a".repeat(40),
		]) {
			expect(isValidObjectiveOwner(owner)).toBe(false);
		}
	});

	test("parses selectors into locators and bare slugs", () => {
		expect(parseObjectiveSelector("tester/alpha")).toEqual({
			type: "locator",
			locator: { owner: "tester", slug: "alpha" },
		});
		expect(parseObjectiveSelector("alpha")).toEqual({ type: "bare-slug", slug: "alpha" });
		for (const input of ["a/b/c", "/alpha", "tester/", "@tester/alpha", "Tester/alpha", ""]) {
			expect(parseObjectiveSelector(input).type).toBe("invalid");
		}
	});

	test("locator strings must be full <owner>/<slug>", () => {
		expect(parseObjectiveLocatorString("tester/alpha")).toEqual({
			owner: "tester",
			slug: "alpha",
		});
		expect(parseObjectiveLocatorString("alpha")).toBeNull();
		expect(parseObjectiveLocatorString("a/b/c")).toBeNull();
	});

	test("renders and validates locators", () => {
		expect(renderObjectiveLocator({ owner: "tester", slug: "alpha" })).toBe("tester/alpha");
		expect(isValidObjectiveLocator({ owner: "tester", slug: "alpha" })).toBe(true);
		expect(isValidObjectiveLocator({ owner: "-bad", slug: "alpha" })).toBe(false);
	});
});

describe("Objective storage", () => {
	test("constructs checked-in storage paths", () => {
		expect(activeRootRelativePath()).toBe(".ns/objectives");
		expect(ownerNestedRecordRelativePath({ owner: "tester", slug: "alpha" })).toBe(
			".ns/objectives/tester/alpha",
		);
		expect(legacyFlatRecordRelativePath("alpha")).toBe(".ns/objectives/alpha");
	});

	test("discovers owner-nested records sorted by locator with closed markers", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{ owner: OWNER, slug: "zeta" },
				{ owner: OWNER, slug: "alpha", isClosed: true },
				{ owner: "other", slug: "bravo" },
			],
			directories: [".ns/not-objectives/ignored"],
		});

		const inventory = await storage(fake).checkoutInventory();
		expect(inventory).toEqual({
			ok: true,
			value: {
				records: [
					{
						owner: "other",
						slug: "bravo",
						locator: "other/bravo",
						recordRelativePath: ".ns/objectives/other/bravo",
						layout: "owner-nested",
						status: "open",
					},
					{
						owner: OWNER,
						slug: "alpha",
						locator: "tester/alpha",
						recordRelativePath: ".ns/objectives/tester/alpha",
						layout: "owner-nested",
						status: "closed",
					},
					{
						owner: OWNER,
						slug: "zeta",
						locator: "tester/zeta",
						recordRelativePath: ".ns/objectives/tester/zeta",
						layout: "owner-nested",
						status: "open",
					},
				],
				findings: [],
			},
		});
	});

	test("discovers legacy flat closed records with owner from frontmatter", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ owner: OWNER, slug: "old-work", layout: "legacy-flat-closed" }],
		});

		const inventory = await storage(fake).checkoutInventory();
		expect(inventory).toEqual({
			ok: true,
			value: {
				records: [
					{
						owner: OWNER,
						slug: "old-work",
						locator: "tester/old-work",
						recordRelativePath: ".ns/objectives/old-work",
						layout: "legacy-flat-closed",
						status: "closed",
					},
				],
				findings: [],
			},
		});
	});

	test("legacy flat closed records without valid owner frontmatter become findings", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{
					owner: OWNER,
					slug: "no-owner",
					layout: "legacy-flat-closed",
					objectiveMd: "# no frontmatter\n",
				},
			],
		});

		const inventory = await storage(fake).checkoutInventory();
		if (!inventory.ok) throw new Error("unexpected storage failure");
		expect(inventory.value.records).toEqual([]);
		expect(inventory.value.findings).toEqual([
			{
				path: ".ns/objectives/no-owner",
				message: expect.stringContaining("legacy flat closed record has no valid owner"),
			},
		]);
	});

	test("flat open records, invalid owner directories, root files, and empty owner directories are findings", async () => {
		const fake = new FakeObjectiveStorageGateway({
			directories: [".ns/objectives/Invalid-Owner", ".ns/objectives/empty-owner"],
			files: {
				// Dot-prefixed entries are repository infrastructure and never findings.
				".ns/objectives/.gitkeep": "",
				".ns/objectives/stray-note.md": "stray\n",
				".ns/objectives/flat-open/objective.md": "---\nowner: tester\n---\n# flat\n",
			},
		});

		const inventory = await storage(fake).checkoutInventory();
		if (!inventory.ok) throw new Error("unexpected storage failure");
		expect(inventory.value.records).toEqual([]);
		expect(inventory.value.findings).toEqual([
			{
				path: ".ns/objectives/empty-owner",
				message: expect.stringContaining("empty Objective owner directory"),
			},
			{
				path: ".ns/objectives/flat-open",
				message: expect.stringContaining("flat open Objective record"),
			},
			{
				path: ".ns/objectives/Invalid-Owner",
				message: expect.stringContaining("invalid Objective owner directory name"),
			},
			{
				path: ".ns/objectives/stray-note.md",
				message: expect.stringContaining("unexpected non-directory entry"),
			},
		]);
	});

	test("duplicate locators are findings and never silently shadowed", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{ owner: OWNER, slug: "dup", isClosed: true },
				{ owner: OWNER, slug: "dup", layout: "legacy-flat-closed" },
			],
		});

		const inventory = await storage(fake).checkoutInventory();
		if (!inventory.ok) throw new Error("unexpected storage failure");
		expect(inventory.value.records).toEqual([]);
		expect(inventory.value.findings).toHaveLength(2);
		for (const finding of inventory.value.findings) {
			expect(finding.message).toContain("duplicate Objective locator tester/dup");
		}
	});

	test("deep structure findings flag record-like directories deeper than owner/slug", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ owner: OWNER, slug: "alpha" }],
			files: {
				".ns/objectives/tester/alpha/nested-record/objective.md": "# too deep\n",
			},
		});
		const objectiveStorage = storage(fake);
		const inventory = await objectiveStorage.checkoutInventory();
		if (!inventory.ok) throw new Error("unexpected storage failure");

		await expect(objectiveStorage.deepStructureFindings(inventory.value)).resolves.toEqual({
			ok: true,
			value: [
				{
					path: ".ns/objectives/tester/alpha/nested-record",
					message: expect.stringContaining("record-like directory nested deeper"),
				},
			],
		});
	});

	test("missing or non-directory active root returns empty inventory", async () => {
		await expect(storage(new FakeObjectiveStorageGateway()).checkoutInventory()).resolves.toEqual({
			ok: true,
			value: { records: [], findings: [] },
		});
		await expect(
			storage(
				new FakeObjectiveStorageGateway({ files: { ".ns/objectives": "not a directory\n" } }),
			).checkoutInventory(),
		).resolves.toEqual({
			ok: true,
			value: { records: [], findings: [] },
		});
	});

	test("reports file presence and direct sorted update markdown files from the discovered path", async () => {
		const recordPath = nestedPath("alpha");
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({
				directories: [recordPath, `${recordPath}/updates`, `${recordPath}/updates/nested`],
				files: {
					[`${recordPath}/objective.md`]: "---\nowner: tester\n---\n# objective\n",
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
				{ name: "alpha.md", path: ".ns/objectives/tester/alpha/updates/alpha.md" },
				{ name: "zeta.md", path: ".ns/objectives/tester/alpha/updates/zeta.md" },
			],
		});
	});

	test("legacy flat closed update paths stay on the flat record path", async () => {
		const recordPath = legacyFlatRecordRelativePath("old-work");
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({
				records: [
					{
						owner: OWNER,
						slug: "old-work",
						layout: "legacy-flat-closed",
						updates: { "20260712T120000Z-note.md": "# note\n" },
					},
				],
			}),
		);
		await expect(objectiveStorage.listUpdateFiles(recordPath)).resolves.toEqual({
			ok: true,
			value: [
				{
					name: "20260712T120000Z-note.md",
					path: ".ns/objectives/old-work/updates/20260712T120000Z-note.md",
				},
			],
		});
	});

	test("resolves locators through discovered inventory", async () => {
		const objectiveStorage = storage(
			new FakeObjectiveStorageGateway({
				records: [
					{ owner: OWNER, slug: "active" },
					{ owner: OWNER, slug: "old-work", layout: "legacy-flat-closed" },
				],
			}),
		);

		await expect(
			objectiveStorage.resolveRecordLocation({ owner: OWNER, slug: "active" }),
		).resolves.toEqual({
			ok: true,
			value: expect.objectContaining({
				locator: "tester/active",
				recordRelativePath: ".ns/objectives/tester/active",
				layout: "owner-nested",
			}),
		});
		await expect(
			objectiveStorage.resolveRecordLocation({ owner: OWNER, slug: "old-work" }),
		).resolves.toEqual({
			ok: true,
			value: expect.objectContaining({
				locator: "tester/old-work",
				recordRelativePath: ".ns/objectives/old-work",
				layout: "legacy-flat-closed",
			}),
		});
		await expect(
			objectiveStorage.resolveRecordLocation({ owner: "other", slug: "active" }),
		).resolves.toEqual({ ok: true, value: null });
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

	test("reads the record document through the shared Record Frontmatter reader", async () => {
		const frontmattered = [
			"---",
			"owner: tester",
			"blocked: Gated on an upstream landing.",
			"edges: []",
			"---",
			"# alpha",
			"",
		].join("\n");
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{ owner: OWNER, slug: "alpha", objectiveMd: frontmattered },
				{ owner: OWNER, slug: "bravo", objectiveMd: "# bravo\n" },
			],
		});
		const objectiveStorage = storage(fake);

		await expect(
			objectiveStorage.readObjectiveRecordDocument(nestedPath("alpha")),
		).resolves.toEqual({
			type: "ok",
			content: frontmattered,
			document: {
				frontmatter: {
					type: "frontmatter",
					frontmatter: {
						owner: "tester",
						blocked: "Gated on an upstream landing.",
						edges: [],
					},
				},
				body: "# alpha\n",
			},
		});
		await expect(
			objectiveStorage.readObjectiveRecordDocument(nestedPath("bravo")),
		).resolves.toEqual({
			type: "ok",
			content: "# bravo\n",
			document: { body: "# bravo\n" },
		});
	});

	test("record document reads propagate missing and unreadable objective.md", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [
				{ owner: OWNER, slug: "alpha", objectiveMd: null },
				{ owner: OWNER, slug: "bravo" },
			],
			unreadableFiles: { ".ns/objectives/tester/bravo/objective.md": "permission denied" },
		});
		const objectiveStorage = storage(fake);

		await expect(
			objectiveStorage.readObjectiveRecordDocument(nestedPath("alpha")),
		).resolves.toEqual({ type: "missing" });
		await expect(
			objectiveStorage.readObjectiveRecordDocument(nestedPath("bravo")),
		).resolves.toEqual({ type: "unreadable", message: "permission denied" });
	});

	test("extracts locator candidates from active record child paths", () => {
		expect(
			objectiveLocatorCandidatesFromActivePath(".ns/objectives/tester/alpha/objective.md"),
		).toEqual({
			nested: { owner: "tester", slug: "alpha" },
			flatSlug: "tester",
		});
		expect(objectiveLocatorCandidatesFromActivePath(".ns/objectives/alpha/objective.md")).toEqual({
			nested: null,
			flatSlug: "alpha",
		});
		for (const path of [
			".ns/objectives",
			".ns/objectives/alpha",
			".ns/not-objectives/alpha/objective.md",
			"README.md",
		]) {
			expect(objectiveLocatorCandidatesFromActivePath(path)).toEqual({
				nested: null,
				flatSlug: null,
			});
		}
	});

	test("resolves changed paths to locators by intersecting with inventory", () => {
		const records: ObjectiveRecordLocation[] = [
			{
				owner: "tester",
				slug: "alpha",
				locator: "tester/alpha",
				recordRelativePath: ".ns/objectives/tester/alpha",
				layout: "owner-nested",
				status: "open",
			},
			{
				owner: "tester",
				slug: "old-work",
				locator: "tester/old-work",
				recordRelativePath: ".ns/objectives/old-work",
				layout: "legacy-flat-closed",
				status: "closed",
			},
		];
		expect(
			objectiveLocatorsFromChangedPaths(
				[
					".ns/objectives/tester/alpha/objective.md",
					".ns/objectives/old-work/updates/one.md",
					".ns/objectives/unknown/thing/objective.md",
					"README.md",
				],
				records,
			),
		).toEqual(["tester/alpha", "tester/old-work"]);
	});
});
