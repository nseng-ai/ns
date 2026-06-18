import { describe, expect, test } from "vitest";

import type { ObjectiveList, ObjectiveListRecord } from "../src/objective-list.ts";
import {
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	type ObjectiveDiffSelection,
} from "../src/objective-picker.ts";

describe("parseObjectiveDiffChangedSlugs", () => {
	test("modified Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("M\t.asdl/objectives/alpha/objective.md\n")).toEqual([
			"alpha",
		]);
	});

	test("deleted Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("D\t.asdl/objectives/alpha/roadmap.md\n")).toEqual([
			"alpha",
		]);
	});

	test("rename includes old and new slugs", () => {
		expect(
			parseObjectiveDiffChangedSlugs(
				"R100\t.asdl/objectives/bravo/objective.md\t.asdl/objectives/charlie/objective.md\n",
			),
		).toEqual(["bravo", "charlie"]);
	});

	test("copy includes old and new slugs", () => {
		expect(
			parseObjectiveDiffChangedSlugs(
				"C075\t.asdl/objectives/delta/roadmap.md\t.asdl/objectives/echo/roadmap.md\n",
			),
		).toEqual(["delta", "echo"]);
	});

	test("non-Objective paths are ignored", () => {
		expect(parseObjectiveDiffChangedSlugs("M\tdocs/readme.md\n")).toEqual([]);
	});

	test("Objective root without slug is ignored", () => {
		expect(parseObjectiveDiffChangedSlugs("M\t.asdl/objectives\n")).toEqual([]);
	});

	test("duplicate slugs are deduplicated and sorted", () => {
		const stdout = [
			"M\t.asdl/objectives/zeta/objective.md",
			"M\t.asdl/objectives/alpha/objective.md",
			"D\t.asdl/objectives/zeta/roadmap.md",
		].join("\n");

		expect(parseObjectiveDiffChangedSlugs(stdout)).toEqual(["alpha", "zeta"]);
	});

	test("empty output returns an empty array", () => {
		expect(parseObjectiveDiffChangedSlugs("\n")).toEqual([]);
	});
});

describe("parseObjectiveStatusChangedSlugs", () => {
	test("modified Objective path produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs(" M .asdl/objectives/alpha/objective.md\0")).toEqual([
			"alpha",
		]);
	});

	test("deleted Objective path produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs(" D .asdl/objectives/alpha/roadmap.md\0")).toEqual([
			"alpha",
		]);
	});

	test("untracked Objective file produces a slug", () => {
		expect(parseObjectiveStatusChangedSlugs("?? .asdl/objectives/bravo/objective.md\0")).toEqual([
			"bravo",
		]);
	});

	test("archive-root paths are ignored", () => {
		expect(
			parseObjectiveStatusChangedSlugs(" M .asdl/objective-archive/alpha/objective.md\0"),
		).toEqual([]);
	});

	test("unrelated paths are ignored", () => {
		expect(parseObjectiveStatusChangedSlugs(" M docs/readme.md\0")).toEqual([]);
	});

	test("duplicate slugs are deduplicated and sorted", () => {
		const stdout = [
			" M .asdl/objectives/zeta/objective.md",
			" A .asdl/objectives/alpha/objective.md",
			" D .asdl/objectives/zeta/roadmap.md",
			"",
		].join("\0");

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["alpha", "zeta"]);
	});

	test("rename includes old and new slugs", () => {
		const stdout =
			"R  .asdl/objectives/new-name/objective.md\0.asdl/objectives/old-name/objective.md\0";

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["new-name", "old-name"]);
	});

	test("copy includes old and new slugs", () => {
		const stdout = "C  .asdl/objectives/echo/objective.md\0.asdl/objectives/delta/objective.md\0";

		expect(parseObjectiveStatusChangedSlugs(stdout)).toEqual(["delta", "echo"]);
	});
});

describe("Objective picker policy", () => {
	test("changedActiveObjectiveSelection returns undefined when there are no changed active records", () => {
		expect(
			changedActiveObjectiveSelection(objectiveList(["alpha"]), "master", ["bravo"]),
		).toBeUndefined();
	});

	test("changedActiveObjectiveSelection returns selection when changed slugs intersect active records", () => {
		expect(
			changedActiveObjectiveSelection(objectiveList(["alpha", "bravo"]), "master", ["bravo"]),
		).toEqual({
			trunkBranch: "master",
			changeBasisLabel: "changed vs master",
			allChangedSlugs: ["bravo"],
			changedActiveSlugs: ["bravo"],
		});
	});

	test("changed active slugs follow Objective list record order", () => {
		const selection = changedActiveObjectiveSelection(
			objectiveList(["charlie", "alpha", "bravo"]),
			"master",
			["bravo", "charlie"],
		);

		expect(selection?.changedActiveSlugs).toEqual(["charlie", "bravo"]);
	});

	test("changed slugs not present in active records do not produce suggestions", () => {
		const selection = changedActiveObjectiveSelection(objectiveList(["alpha", "bravo"]), "master", [
			"closed",
		]);

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
		rootPath: ".asdl/objectives",
		statusFilter: "active",
		namesOnly: false,
		records: slugs.map((slug) => record(slug)),
	};
}

function record(
	slug: string,
	options: { status?: string; latestUpdateIso?: string | null } = {},
): ObjectiveListRecord {
	return {
		slug,
		status: options.status ?? "open",
		latestUpdateIso:
			"latestUpdateIso" in options ? (options.latestUpdateIso ?? null) : "2026-05-20T10:00:00Z",
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
