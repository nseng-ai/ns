import { describe, expect, test } from "vitest";

import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveRecordOptions,
} from "../../src/core/fake-storage.ts";
import {
	objectiveEdgeLintChecks,
	sweepObjectiveStructure,
} from "../../src/core/operations/edge-lint.ts";
import { splitObjectiveRecordDocument } from "../../src/core/record-frontmatter.ts";
import { ObjectiveStorage, type ObjectiveRecordLocation } from "../../src/core/storage.ts";
import type { ObjectiveCheckItem } from "../../src/core/operations/check-items.ts";

const OWNER = "tester";

function recordContent(frontmatterLines: readonly string[]): string {
	return ["---", `owner: ${OWNER}`, ...frontmatterLines, "---", "", "# Record", ""].join("\n");
}

function edgeLines(objective: string, annotation: string): string[] {
	return ["edges:", `  - objective: ${objective}`, `    annotation: ${annotation}`];
}

function storageWith(records: readonly FakeObjectiveRecordOptions[]): ObjectiveStorage {
	return new ObjectiveStorage(new FakeObjectiveStorageGateway({ records }));
}

async function lint(
	storage: ObjectiveStorage,
	slug: string,
	content: string,
): Promise<readonly ObjectiveCheckItem[]> {
	const inventory = await storage.checkoutInventory();
	if (!inventory.ok) throw new Error(inventory.error.message);
	const location: ObjectiveRecordLocation = {
		owner: OWNER,
		slug,
		locator: `${OWNER}/${slug}`,
		recordRelativePath: `.ns/objectives/${OWNER}/${slug}`,
		layout: "owner-nested",
		status: "open",
	};
	const result = await objectiveEdgeLintChecks({
		storage,
		records: inventory.value.records,
		location,
		document: splitObjectiveRecordDocument(content),
	});
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

function labels(items: readonly ObjectiveCheckItem[]): string[] {
	return items.map((item) => item.label);
}

const MIRRORED_BETA: FakeObjectiveRecordOptions = {
	owner: OWNER,
	slug: "beta",
	objectiveMd: recordContent(edgeLines("tester/alpha", "Mirror side written from beta.")),
};

describe("objectiveEdgeLintChecks", () => {
	test("no frontmatter is a required-owner violation", async () => {
		const storage = storageWith([]);
		expect(labels(await lint(storage, "alpha", "# Record\n"))).toEqual([
			"objective.md declares required owner frontmatter",
		]);
	});

	test("well-formed mirrored edge with blocked sentence yields no violations", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const content = recordContent([
			"blocked: Gated on beta landing first.",
			...edgeLines("tester/beta", "Consumed as a hard dependency."),
		]);
		expect(await lint(storage, "alpha", content)).toEqual([]);
	});

	test("malformed frontmatter is a single error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(["unknown-key: not in the schema"]),
		);
		expect(labels(violations)).toEqual(["objective.md Record Frontmatter parses"]);
		expect(violations[0]?.severity).toBe("error");
		expect(violations[0]?.isPassed).toBe(false);
	});

	test("invalid owner handle is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			["---", "owner: Bad_Handle", "---", "", "# Record", ""].join("\n"),
		);
		expect(labels(violations)).toEqual(["objective.md owner is a valid handle"]);
	});

	test("owner disagreeing with the owner path segment is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			["---", "owner: someone-else", "---", "", "# Record", ""].join("\n"),
		);
		expect(labels(violations)).toEqual(["objective.md owner matches the owner path segment"]);
	});

	test("empty blocked sentence is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(storage, "alpha", recordContent(['blocked: "   "']));
		expect(labels(violations)).toEqual(["objective.md blocked sentence is non-empty"]);
	});

	test("empty annotation is an error even when the edge is mirrored", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/beta", '"  "')),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/beta has annotation"]);
	});

	test("bare-slug endpoint is an invalid-locator error", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("beta", "Bare slug endpoint.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge beta has a valid locator"]);
	});

	test("multi-segment endpoint is an invalid-locator error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("a/b/c", "Bad endpoint.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge a/b/c has a valid locator"]);
	});

	test("self edge is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/alpha", "Points at itself.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/alpha links a distinct record"]);
	});

	test("duplicate pair entry is an error", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const content = recordContent([
			"edges:",
			"  - objective: tester/beta",
			"    annotation: First entry.",
			"  - objective: tester/beta",
			"    annotation: Second entry for the same pair.",
		]);
		const violations = await lint(storage, "alpha", content);
		expect(labels(violations)).toEqual(["objective.md edge tester/beta appears once"]);
	});

	test("dangling endpoint locator is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/ghost", "No such record.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/ghost endpoint exists"]);
		expect(violations[0]?.detail).toBe("no record in the active root");
	});

	test("cross-owner mirrored edges resolve through inventory", async () => {
		const storage = storageWith([
			{
				owner: "other",
				slug: "beta",
				objectiveMd: [
					"---",
					"owner: other",
					...edgeLines("tester/alpha", "Mirror side from another owner."),
					"---",
					"",
					"# Record",
					"",
				].join("\n"),
			},
		]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("other/beta", "Cross-owner dependency.")),
		);
		expect(violations).toEqual([]);
	});

	test("counterpart without frontmatter is a missing mirror error", async () => {
		const storage = storageWith([{ owner: OWNER, slug: "beta", objectiveMd: "# Beta\n" }]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/beta", "One-sided.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart has no Record Frontmatter");
	});

	test("counterpart lacking the reciprocal entry is a missing mirror error", async () => {
		const storage = storageWith([
			{
				owner: OWNER,
				slug: "beta",
				objectiveMd: recordContent(edgeLines("tester/gamma", "Different edge.")),
			},
			{
				owner: OWNER,
				slug: "gamma",
				objectiveMd: recordContent(edgeLines("tester/beta", "Mirror of beta.")),
			},
		]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/beta", "One-sided.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart does not declare the mirror edge");
	});

	test("counterpart with malformed frontmatter is a missing mirror error", async () => {
		const storage = storageWith([
			{ owner: OWNER, slug: "beta", objectiveMd: recordContent(["unknown-key: nope"]) },
		]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("tester/beta", "One-sided.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge tester/beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart Record Frontmatter is malformed");
	});
});

describe("sweepObjectiveStructure", () => {
	test("sweeps records and reports only violations", async () => {
		const storage = storageWith([
			{
				owner: OWNER,
				slug: "alpha",
				objectiveMd: recordContent(edgeLines("tester/beta", "Depends on beta.")),
			},
			MIRRORED_BETA,
			{ owner: OWNER, slug: "plain" },
			{
				owner: OWNER,
				slug: "active-dangler",
				objectiveMd: recordContent(edgeLines("tester/ghost", "Points nowhere.")),
			},
		]);
		const result = await sweepObjectiveStructure(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.recordCount).toBe(4);
		expect(labels(result.value.violations)).toEqual([
			"objective.md edge tester/ghost endpoint exists",
		]);
		expect(result.value.violations[0]?.path).toBe(
			".ns/objectives/tester/active-dangler/objective.md",
		);
	});

	test("a record directory without objective.md is a violation", async () => {
		const storage = storageWith([{ owner: OWNER, slug: "empty-record", objectiveMd: null }]);
		const result = await sweepObjectiveStructure(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.recordCount).toBe(1);
		expect(labels(result.value.violations)).toEqual(["objective.md exists"]);
	});

	test("an unreadable objective.md is a violation", async () => {
		const storage = new ObjectiveStorage(
			new FakeObjectiveStorageGateway({
				records: [{ owner: OWNER, slug: "unreadable" }],
				unreadableFiles: { ".ns/objectives/tester/unreadable/objective.md": "permission denied" },
			}),
		);
		const result = await sweepObjectiveStructure(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.recordCount).toBe(1);
		expect(labels(result.value.violations)).toEqual(["objective.md is readable Markdown"]);
		expect(result.value.violations[0]?.detail).toBe("permission denied");
	});

	test("structural findings surface as sweep violations", async () => {
		const storage = new ObjectiveStorage(
			new FakeObjectiveStorageGateway({
				records: [{ owner: OWNER, slug: "alpha" }],
				files: { ".ns/objectives/root-note.md": "stray\n" },
			}),
		);
		const result = await sweepObjectiveStructure(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.violations).toEqual([
			{
				path: ".ns/objectives/root-note.md",
				label: "Active Objective Root structure is well-formed",
				isPassed: false,
				severity: "error",
				detail: expect.stringContaining("unexpected non-directory entry"),
			},
		]);
	});
});
