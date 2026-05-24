import { describe, expect, test } from "bun:test";

import type { ObjectiveBranchEntry, ObjectiveList, ObjectiveListGroup } from "../src/objective-list.ts";
import {
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveGroupsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	type ObjectiveDiffSelection,
} from "../src/objective-picker.ts";

describe("parseObjectiveDiffChangedSlugs", () => {
	test("modified Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("M\t.asdl/objectives/alpha/objective.md\n")).toEqual(["alpha"]);
	});

	test("deleted Objective path produces a slug", () => {
		expect(parseObjectiveDiffChangedSlugs("D\t.asdl/objectives/alpha/roadmap.md\n")).toEqual(["alpha"]);
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

describe("Objective picker policy", () => {
	test("changedActiveObjectiveSelection returns undefined when there are no changed active groups", () => {
		expect(changedActiveObjectiveSelection(objectiveList(["alpha"]), "master", ["bravo"])).toBeUndefined();
	});

	test("changedActiveObjectiveSelection returns selection when changed slugs intersect active groups", () => {
		expect(changedActiveObjectiveSelection(objectiveList(["alpha", "bravo"]), "master", ["bravo"])).toEqual({
			trunkBranch: "master",
			allChangedSlugs: ["bravo"],
			changedActiveSlugs: ["bravo"],
		});
	});

	test("changed active slugs follow Objective list group order", () => {
		const selection = changedActiveObjectiveSelection(
			objectiveList(["charlie", "alpha", "bravo"]),
			"master",
			["bravo", "charlie"],
		);

		expect(selection?.changedActiveSlugs).toEqual(["charlie", "bravo"]);
	});

	test("ordinary label uses latestWorkBranch", () => {
		expect(formatObjectiveChoice(group("alpha", { latestWorkBranch: "feat/latest" }))).toBe(
			"alpha — 1 branch — latest work feat/latest — max +3 slice commits",
		);
	});

	test("fallback label uses latest branch timestamp when latestWorkBranch is absent", () => {
		const choice = formatObjectiveChoice(
			group("alpha", {
				latestWorkBranch: null,
				branches: [
					branch("feat/old", "2026-05-20T10:00:00Z", 1),
					branch("feat/new", "2026-05-20T12:00:00Z", 2),
				],
			}),
		);

		expect(choice).toContain("latest work feat/new");
	});

	test("invalid timestamps are ignored for fallback latest branch", () => {
		const choice = formatObjectiveChoice(
			group("alpha", {
				latestWorkBranch: null,
				branches: [branch("feat/bad", "not-a-date", 7), branch("feat/good", "2026-05-20T10:00:00Z", 1)],
			}),
		);

		expect(choice).toContain("latest work feat/good");
	});

	test("all invalid timestamps render latest branch as none", () => {
		const choice = formatObjectiveChoice(
			group("alpha", {
				latestWorkBranch: null,
				branches: [branch("feat/bad", "not-a-date", 7)],
			}),
		);

		expect(choice).toContain("latest work (none)");
	});

	test("max slice commits is maximum across branches", () => {
		const choice = formatObjectiveChoice(
			group("alpha", {
				branches: [branch("feat/a", "2026-05-20T10:00:00Z", 2), branch("feat/b", "2026-05-20T11:00:00Z", 9)],
			}),
		);

		expect(choice).toContain("max +9 slice commits");
	});

	test("branch count pluralization", () => {
		expect(formatObjectiveChoice(group("alpha"))).toContain("1 branch");
		expect(
			formatObjectiveChoice(
				group("alpha", {
					branches: [branch("feat/a", "2026-05-20T10:00:00Z", 2), branch("feat/b", "2026-05-20T11:00:00Z", 9)],
				}),
			),
		).toContain("2 branches");
	});

	test("suggested-only label", () => {
		expect(formatObjectiveChoice(group("alpha"), selection(["alpha"], ["alpha"]))).toContain(
			"suggested: only Objective changed vs master",
		);
	});

	test("changed label", () => {
		expect(formatObjectiveChoice(group("alpha"), selection(["alpha", "closed"], ["alpha"]))).toContain(
			"changed vs master",
		);
	});

	test("unchanged group has no diff label", () => {
		expect(formatObjectiveChoice(group("bravo"), selection(["alpha"], ["alpha"]))).toBe(
			"bravo — 1 branch — latest work feat/bravo — max +3 slice commits",
		);
	});

	test("changed-first ordering preserves relative order within partitions", () => {
		const groups = [group("alpha"), group("bravo"), group("charlie"), group("delta")];

		expect(
			objectiveGroupsWithChangedFirst(groups, selection(["charlie", "alpha"], ["charlie", "alpha"])).map(
				(item) => item.slug,
			),
		).toEqual(["alpha", "charlie", "bravo", "delta"]);
	});

	test("choice map maps labels to slugs", () => {
		const choices = objectiveChoiceMap([group("alpha"), group("bravo")], undefined);

		expect(choices.get("alpha — 1 branch — latest work feat/alpha — max +3 slice commits")).toBe("alpha");
		expect(choices.get("bravo — 1 branch — latest work feat/bravo — max +3 slice commits")).toBe("bravo");
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
		baseBranch: "master",
		trunkBranch: "master",
		view: "list",
		statusFilter: "active",
		currentBranch: null,
		filteredToCurrent: false,
		namesOnly: false,
		groups: slugs.map((slug) => group(slug)),
	};
}

function group(slug: string, options: { latestWorkBranch?: string | null; branches?: ObjectiveBranchEntry[] } = {}): ObjectiveListGroup {
	return {
		slug,
		status: "open",
		latestUpdateIso: null,
		latestWorkBranch: "latestWorkBranch" in options ? options.latestWorkBranch ?? null : `feat/${slug}`,
		branches: options.branches ?? [branch(`feat/${slug}`, "2026-05-20T10:00:00Z", 3)],
	};
}

function branch(name: string, updatedIso: string | null, sliceCommits: number): ObjectiveBranchEntry {
	return { branch: name, parentBranch: "master", updatedIso, sliceCommits };
}

function selection(allChangedSlugs: string[], changedActiveSlugs: string[]): ObjectiveDiffSelection {
	return { trunkBranch: "master", allChangedSlugs, changedActiveSlugs };
}
