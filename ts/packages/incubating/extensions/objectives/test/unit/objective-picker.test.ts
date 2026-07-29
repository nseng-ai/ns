import { describe, expect, test } from "vitest";

import type { ObjectiveList, ObjectiveListRecord } from "../../src/api/index.ts";
import {
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChangedSlugsFromPaths,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	type ObjectiveDiffSelection,
} from "../../src/api/index.ts";

describe("objectiveChangedSlugsFromPaths", () => {
	test("Objective paths produce deduplicated sorted slugs", () => {
		expect(
			objectiveChangedSlugsFromPaths([
				".ns/objectives/tester/zeta/objective.md",
				".ns/objectives/tester/alpha/roadmap.md",
				".ns/objectives/tester/zeta/roadmap.md",
			]),
		).toEqual(["tester/alpha", "tester/zeta"]);
	});

	test("non-active, unrelated, and Objective root paths are ignored", () => {
		expect(
			objectiveChangedSlugsFromPaths([
				".ns/not-objectives/alpha/objective.md",
				"docs/readme.md",
				".ns/objectives",
				".ns/objectives/flat-record/objective.md",
			]),
		).toEqual([]);
	});
});

const NOW = Date.parse("2026-06-03T10:00:00Z");

describe("Objective picker policy", () => {
	test("changedActiveObjectiveSelection returns undefined when there are no changed active records", () => {
		expect(
			changedActiveObjectiveSelection({
				objectiveList: objectiveList(["alpha"]),
				trunkBranch: "master",
				allChangedSlugs: ["tester/bravo"],
			}),
		).toBeUndefined();
	});

	test("changedActiveObjectiveSelection returns selection when changed slugs intersect active records", () => {
		expect(
			changedActiveObjectiveSelection({
				objectiveList: objectiveList(["alpha", "bravo"]),
				trunkBranch: "master",
				allChangedSlugs: ["tester/bravo"],
			}),
		).toEqual({
			trunkBranch: "master",
			changeBasisLabel: "changed vs master",
			allChangedSlugs: ["tester/bravo"],
			changedActiveSlugs: ["tester/bravo"],
		});
	});

	test("changed active slugs follow Objective list record order", () => {
		const selection = changedActiveObjectiveSelection({
			objectiveList: objectiveList(["charlie", "alpha", "bravo"]),
			trunkBranch: "master",
			allChangedSlugs: ["tester/bravo", "tester/charlie"],
		});

		expect(selection?.changedActiveSlugs).toEqual(["tester/charlie", "tester/bravo"]);
	});

	test("changed slugs not present in active records do not produce suggestions", () => {
		const selection = changedActiveObjectiveSelection({
			objectiveList: objectiveList(["alpha", "bravo"]),
			trunkBranch: "master",
			allChangedSlugs: ["tester/closed"],
		});

		expect(selection).toBeUndefined();
	});

	test("ordinary label uses checkout-local status and latest update", () => {
		expect(
			formatObjectiveChoice(record("alpha", { latestUpdateIso: "2026-06-03T08:00:00Z" }), NOW),
		).toBe("tester/alpha — open — latest update 2 hours ago");
	});

	test("ordinary label renders missing latest update as an em dash", () => {
		expect(formatObjectiveChoice(record("alpha", { latestUpdateIso: null }), NOW)).toBe(
			"tester/alpha — open — latest update —",
		);
	});

	test("suggested-only label", () => {
		expect(
			formatObjectiveChoice(record("alpha"), NOW, selection(["tester/alpha"], ["tester/alpha"])),
		).toBe(
			"tester/alpha — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
		);
	});

	test("changed label", () => {
		expect(
			formatObjectiveChoice(
				record("alpha"),
				NOW,
				selection(["tester/alpha", "tester/closed"], ["tester/alpha"]),
			),
		).toBe("tester/alpha — changed vs master — open — latest update 2 weeks ago");
	});

	test("unchanged record has no diff label", () => {
		expect(
			formatObjectiveChoice(record("bravo"), NOW, selection(["tester/alpha"], ["tester/alpha"])),
		).toBe("tester/bravo — open — latest update 2 weeks ago");
	});

	test("changed-first ordering preserves relative order within partitions", () => {
		const records = [record("alpha"), record("bravo"), record("charlie"), record("delta")];

		expect(
			objectiveRecordsWithChangedFirst(
				records,
				selection(["tester/charlie", "tester/alpha"], ["tester/charlie", "tester/alpha"]),
			).map((item) => item.slug),
		).toEqual(["alpha", "charlie", "bravo", "delta"]);
	});

	test("choice map maps labels to slugs", () => {
		const choices = objectiveChoiceMap([record("alpha"), record("bravo")], NOW);

		expect(choices.get("tester/alpha — open — latest update 2 weeks ago")).toBe("tester/alpha");
		expect(choices.get("tester/bravo — open — latest update 2 weeks ago")).toBe("tester/bravo");
	});

	test("picker title variants", () => {
		expect(objectiveDiffPickerTitle("Pick", selection(["tester/alpha"], ["tester/alpha"]))).toBe(
			"Pick (only Objective changed vs master)",
		);
		expect(
			objectiveDiffPickerTitle(
				"Pick",
				selection(["tester/alpha", "tester/closed"], ["tester/alpha"]),
			),
		).toBe("Pick (changed Objectives vs master)");
	});
});

function objectiveList(slugs: string[]): ObjectiveList {
	return {
		trunkBranch: "master",
		rootPath: ".ns/objectives",
		statusFilter: "active",
		ownerScope: { type: "current", owner: "tester" },
		namesOnly: false,
		records: slugs.map((slug) => record(slug)),
	};
}

function record(
	slug: string,
	options: { status?: "open" | "closed"; latestUpdateIso?: string | null } = {},
): ObjectiveListRecord {
	return {
		owner: "tester",
		slug,
		locator: `tester/${slug}`,
		layout: "owner-nested",
		status: options.status ?? "open",
		latestUpdateIso:
			"latestUpdateIso" in options ? (options.latestUpdateIso ?? null) : "2026-05-20T10:00:00Z",
		hasOutstandingChanges: false,
	};
}

function selection(
	allChangedSlugs: string[],
	changedActiveSlugs: string[],
): ObjectiveDiffSelection {
	return {
		trunkBranch: "master",
		changeBasisLabel: "changed vs master",
		allChangedSlugs,
		changedActiveSlugs,
	};
}
