import { describe, expect, test } from "vitest";

import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveRecordOptions,
} from "../../src/core/fake-storage.ts";
import {
	objectiveEdgeLintChecks,
	sweepObjectiveEdgeLint,
} from "../../src/core/operations/edge-lint.ts";
import { splitObjectiveRecordDocument } from "../../src/core/record-frontmatter.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import type { ObjectiveCheckItem } from "../../src/core/operations/check-items.ts";

function recordContent(frontmatterLines: readonly string[]): string {
	return ["---", ...frontmatterLines, "---", "", "# Record", ""].join("\n");
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
	const result = await objectiveEdgeLintChecks({
		storage,
		slug,
		recordRelativePath: `.ji/objectives/${slug}`,
		document: splitObjectiveRecordDocument(content),
	});
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

function labels(items: readonly ObjectiveCheckItem[]): string[] {
	return items.map((item) => item.label);
}

const MIRRORED_BETA: FakeObjectiveRecordOptions = {
	slug: "beta",
	objectiveMd: recordContent(edgeLines("alpha", "Mirror side written from beta.")),
};

describe("objectiveEdgeLintChecks", () => {
	test("no frontmatter yields no violations", async () => {
		const storage = storageWith([]);
		expect(await lint(storage, "alpha", "# Record\n")).toEqual([]);
	});

	test("well-formed mirrored edge with blocked sentence yields no violations", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const content = recordContent([
			"blocked: Gated on beta landing first.",
			...edgeLines("beta", "Consumed as a hard dependency."),
		]);
		expect(await lint(storage, "alpha", content)).toEqual([]);
	});

	test("mirror lookup resolves counterparts in the archive root", async () => {
		const storage = storageWith([{ ...MIRRORED_BETA, isArchived: true, isClosed: true }]);
		const content = recordContent(edgeLines("beta", "Still linked after archiving."));
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

	test("empty blocked sentence is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(storage, "alpha", recordContent(['blocked: "   "']));
		expect(labels(violations)).toEqual(["objective.md blocked sentence is non-empty"]);
	});

	test("empty annotation is an error even when the edge is mirrored", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const violations = await lint(storage, "alpha", recordContent(edgeLines("beta", '"  "')));
		expect(labels(violations)).toEqual(["objective.md edge beta has annotation"]);
	});

	test("invalid endpoint slug is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("nested/slug", "Bad endpoint.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge nested/slug has a valid slug"]);
	});

	test("self edge is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("alpha", "Points at itself.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge alpha links a distinct record"]);
	});

	test("duplicate pair entry is an error", async () => {
		const storage = storageWith([MIRRORED_BETA]);
		const content = recordContent([
			"edges:",
			"  - objective: beta",
			"    annotation: First entry.",
			"  - objective: beta",
			"    annotation: Second entry for the same pair.",
		]);
		const violations = await lint(storage, "alpha", content);
		expect(labels(violations)).toEqual(["objective.md edge beta appears once"]);
	});

	test("dangling endpoint slug is an error", async () => {
		const storage = storageWith([]);
		const violations = await lint(
			storage,
			"alpha",
			recordContent(edgeLines("ghost", "No such record.")),
		);
		expect(labels(violations)).toEqual(["objective.md edge ghost endpoint exists"]);
		expect(violations[0]?.detail).toBe("no record in the active or archive root");
	});

	test("counterpart without frontmatter is a missing mirror error", async () => {
		const storage = storageWith([{ slug: "beta", objectiveMd: "# Beta\n" }]);
		const violations = await lint(storage, "alpha", recordContent(edgeLines("beta", "One-sided.")));
		expect(labels(violations)).toEqual(["objective.md edge beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart has no Record Frontmatter");
	});

	test("counterpart lacking the reciprocal entry is a missing mirror error", async () => {
		const storage = storageWith([
			{ slug: "beta", objectiveMd: recordContent(edgeLines("gamma", "Different edge.")) },
			{ slug: "gamma", objectiveMd: recordContent(edgeLines("beta", "Mirror of beta.")) },
		]);
		const violations = await lint(storage, "alpha", recordContent(edgeLines("beta", "One-sided.")));
		expect(labels(violations)).toEqual(["objective.md edge beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart does not declare the mirror edge");
	});

	test("counterpart with malformed frontmatter is a missing mirror error", async () => {
		const storage = storageWith([
			{ slug: "beta", objectiveMd: recordContent(["unknown-key: nope"]) },
		]);
		const violations = await lint(storage, "alpha", recordContent(edgeLines("beta", "One-sided.")));
		expect(labels(violations)).toEqual(["objective.md edge beta is mirrored"]);
		expect(violations[0]?.detail).toBe("counterpart Record Frontmatter is malformed");
	});
});

describe("sweepObjectiveEdgeLint", () => {
	test("sweeps active and archived records and reports only violations", async () => {
		const storage = storageWith([
			{ slug: "alpha", objectiveMd: recordContent(edgeLines("beta", "Depends on beta.")) },
			MIRRORED_BETA,
			{ slug: "plain", objectiveMd: "# Plain record\n" },
			{
				slug: "archived-dangler",
				objectiveMd: recordContent(edgeLines("ghost", "Points nowhere.")),
				isArchived: true,
				isClosed: true,
			},
		]);
		const result = await sweepObjectiveEdgeLint(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.recordCount).toBe(4);
		expect(labels(result.value.violations)).toEqual(["objective.md edge ghost endpoint exists"]);
		expect(result.value.violations[0]?.path).toBe(
			".ji/objective-archive/archived-dangler/objective.md",
		);
	});

	test("a record directory without objective.md is a violation", async () => {
		const storage = storageWith([{ slug: "empty-record", objectiveMd: null }]);
		const result = await sweepObjectiveEdgeLint(storage);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.recordCount).toBe(1);
		expect(labels(result.value.violations)).toEqual(["objective.md exists"]);
	});
});
