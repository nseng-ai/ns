import { describe, expect, test } from "vitest";

import type { ObjectiveList, ObjectiveListRecord } from "../../src/api/index.ts";
import {
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	type ObjectiveDiffSelection,
} from "../../src/api/index.ts";

describe("parseObjectiveDiffChangedSlugs", () => {
	test("modified Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("M\t.ji/objectives/alpha/objective.md\n")).toEqual([
			"alpha",
		]);
	});

	test("deleted Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("D\t.ji/objectives/alpha/roadmap.md\n")).toEqual([
			"alpha",
		]);
	});

	test("rename includes old and new slugs", () => {
		expect(
			parseObjectiveDiffChangedSlugs(
				"R100\t.ji/objectives/bravo/objective.md\t.ji/objectives/charlie/objective.md\n",
			),
		).toEqual(["bravo", "charlie"]);
	});

	test("copy includes old and new slugs", () => {
		expect(
			parseObjectiveDiffChangedSlugs(
				"C075\t.ji/objectives/delta/roadmap.md\t.ji/objectives/echo/roadmap.md\n",
			),
		).toEqual(["delta", "echo"]);
	});

	test("non-Objective paths are ignored", () => {
		expect(parseObjectiveDiffChangedSlugs("M\tdocs/readme.md\n")).toEqual([]);
	});

	test("Objective root without slug is ignored", () => {
		expect(parseObjectiveDiffChangedSlugs("M\t.ji/objectives\n")).toEqual([]);
	});

	test("duplicate slugs are deduplicated and sorted", () => {
		const stdout = [
			"M\t.ji/objectives/zeta/objective.md",
			"M\t.ji/objectives/alpha/objective.md",
			"D\t.ji/objectives/zeta/roadmap.md",
		].join("\n");

		expect(parseObjectiveDiffChangedSlugs(stdout)).toEqual(["alpha", "zeta"]);
	});

	test("empty output returns an empty array", () => {
		expect(parseObjectiveDiffChangedSlugs("\n")).toEqual([]);
	});
});

describe("parseObjectiveStatusChangedSlugs", () => {
	test("modified Objective path produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs(" M .ji/objectives/alpha/objective.md\0")).toEqual([
			"alpha",
		]);
	});

	test("deleted Objective path produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs(" D .ji/objectives/alpha/roadmap.md\0")).toEqual([
			"alpha",
		]);
	});

	test("untracked Objective file produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs("?? .ji/objectives/bravo/objective.md\0")).toEqual([
			"bravo",
		]);
	});

	test("archive-root paths are ignored", () => {
		expect(
			parseObjectiveStatusChangedSlugs(" M .ji/objective-archive/alpha/objective.md\0"),
		).toEqual([]);
	});

	test("unrelated paths are ignored", () => {
		expect(parseObjectiveStatusChangedSlugs(" M docs/readme.md\0")).toEqual([]);
	});

	test("duplicate slugs are deduplicated and sorted", () => {
		const stdout = [
			" M .ji/objectives/zeta/objective.md",
			" A .ji/objectives/alpha/objective.md",
			" D .ji/objectives/zeta/roadmap.md",
			"",
		].join("\0");

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["alpha", "zeta"]);
	});

	test("rename includes old and new slugs", () => {
		const stdout =
			"R  .ji/objectives/new-name/objective.md\0.ji/objectives/old-name/objective.md\0";

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["new-name", "old-name"]);
	});

	test("copy includes old and new slugs", () => {
		const stdout = "C  .ji/objectives/echo/objective.md\0.ji/objectives/delta/objective.md\0";

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["delta", "echo"]);
	});
});

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
			formatObjectiveChoice(record("alpha", { latestUpdateIso: "2026-05-20T10:00:00Z" })),
		).toBe("alpha — open — latest update 2026-05-20T10:00:00Z");
	});

	test("ordinary label renders missing latest update as an em dash", () => {
		expect(formatObjectiveChoice(record("alpha", { latestUpdateIso: null }))).toBe(
			"alpha — open — latest update —",
		);
	});

	test("suggested-only label", () => {
		expect(formatObjectiveChoice(record("alpha"), selection(["alpha"], ["alpha"]))).toBe(
			"alpha — suggested: only Objective changed vs master — open — latest update 2026-05-20T10:00:00Z",
		);
	});

	test("changed label", () => {
		expect(formatObjectiveChoice(record("alpha"), selection(["alpha", "closed"], ["alpha"]))).toBe(
			"alpha — changed vs master — open — latest update 2026-05-20T10:00:00Z",
		);
	});

	test("unchanged record has no diff label", () => {
		expect(formatObjectiveChoice(record("bravo"), selection(["alpha"], ["alpha"]))).toBe(
			"bravo — open — latest update 2026-05-20T10:00:00Z",
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
		const choices = objectiveChoiceMap([record("alpha"), record("bravo")], undefined);

		expect(choices.get("alpha — open — latest update 2026-05-20T10:00:00Z")).toBe("alpha");
		expect(choices.get("bravo — open — latest update 2026-05-20T10:00:00Z")).toBe("bravo");
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
		rootPath: ".ji/objectives",
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
