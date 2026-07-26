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
				".ns/objectives/zeta/objective.md",
				".ns/objectives/alpha/roadmap.md",
				".ns/objectives/zeta/roadmap.md",
			]),
		).toEqual(["alpha", "zeta"]);
	});

	test("non-active, unrelated, and Objective root paths are ignored", () => {
		expect(
			objectiveChangedSlugsFromPaths([
				".ns/not-objectives/alpha/objective.md",
				"docs/readme.md",
				".ns/objectives",
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
				allChangedSlugs: ["bravo"],
			}),
		).toBeUndefined();
	});

	test("changedActiveObjectiveSelection returns selection when changed slugs intersect active records", () => {
		expect(
			changedActiveObjectiveSelection({
				objectiveList: objectiveList(["alpha", "bravo"]),
				trunkBranch: "master",
				allChangedSlugs: ["bravo"],
			}),
		).toEqual({
			trunkBranch: "master",
			changeBasisLabel: "changed vs master",
			allChangedSlugs: ["bravo"],
			changedActiveSlugs: ["bravo"],
		});
	});

	test("changed active slugs follow Objective list record order", () => {
		const selection = changedActiveObjectiveSelection({
			objectiveList: objectiveList(["charlie", "alpha", "bravo"]),
			trunkBranch: "master",
			allChangedSlugs: ["bravo", "charlie"],
		});

		expect(selection?.changedActiveSlugs).toEqual(["charlie", "bravo"]);
	});

	test("changed slugs not present in active records do not produce suggestions", () => {
		const selection = changedActiveObjectiveSelection({
			objectiveList: objectiveList(["alpha", "bravo"]),
			trunkBranch: "master",
			allChangedSlugs: ["closed"],
		});

		expect(selection).toBeUndefined();
	});

	test("ordinary label uses checkout-local status and latest update", () => {
		expect(
			formatObjectiveChoice(record("alpha", { latestUpdateIso: "2026-06-03T08:00:00Z" }), NOW),
		).toBe("alpha — open — latest update 2 hours ago");
	});

	test("ordinary label renders missing latest update as an em dash", () => {
		expect(formatObjectiveChoice(record("alpha", { latestUpdateIso: null }), NOW)).toBe(
			"alpha — open — latest update —",
		);
	});

	test("suggested-only label", () => {
		expect(formatObjectiveChoice(record("alpha"), NOW, selection(["alpha"], ["alpha"]))).toBe(
			"alpha — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
		);
	});

	test("changed label", () => {
		expect(
			formatObjectiveChoice(record("alpha"), NOW, selection(["alpha", "closed"], ["alpha"])),
		).toBe("alpha — changed vs master — open — latest update 2 weeks ago");
	});

	test("unchanged record has no diff label", () => {
		expect(formatObjectiveChoice(record("bravo"), NOW, selection(["alpha"], ["alpha"]))).toBe(
			"bravo — open — latest update 2 weeks ago",
		);
	});

	test("changed-first ordering preserves relative order within partitions", () => {
		const records = [record("alpha"), record("bravo"), record("charlie"), record("delta")];

		expect(
			objectiveRecordsWithChangedFirst(
				records,
				selection(["charlie", "alpha"], ["charlie", "alpha"]),
			).map((item) => item.slug),
		).toEqual(["alpha", "charlie", "bravo", "delta"]);
	});

	test("choice map maps labels to slugs", () => {
		const choices = objectiveChoiceMap([record("alpha"), record("bravo")], NOW);

		expect(choices.get("alpha — open — latest update 2 weeks ago")).toBe("alpha");
		expect(choices.get("bravo — open — latest update 2 weeks ago")).toBe("bravo");
	});

	test("picker title variants", () => {
		expect(objectiveDiffPickerTitle("Pick", selection(["alpha"], ["alpha"]))).toBe(
			"Pick (only Objective changed vs master)",
		);
		expect(objectiveDiffPickerTitle("Pick", selection(["alpha", "closed"], ["alpha"]))).toBe(
			"Pick (changed Objectives vs master)",
		);
	});
});

function objectiveList(slugs: string[]): ObjectiveList {
	return {
		trunkBranch: "master",
		rootPath: ".ns/objectives",
		statusFilter: "active",
		namesOnly: false,
		records: slugs.map((slug) => record(slug)),
	};
}

function record(
	slug: string,
	options: { status?: "open" | "closed"; latestUpdateIso?: string | null } = {},
): ObjectiveListRecord {
	return {
		slug,
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
