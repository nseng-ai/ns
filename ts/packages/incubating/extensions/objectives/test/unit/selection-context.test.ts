import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";

import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
	type ObjectiveSelectionCommandUi,
} from "../../src/api/index.ts";

interface SourceUi extends ObjectiveSelectionCommandUi {
	readonly label: string;
	readonly notifications: string[];
	readonly statuses: string[];
	readonly selections: string[];
}

describe("objectiveSelectionContextFromCommandContext", () => {
	test("adapts command contexts with bound UI methods", async () => {
		let idleWaits = 0;
		let observedSelectOptions: string[] | undefined;
		const ui: SourceUi = {
			label: "source-ui",
			notifications: [],
			statuses: [],
			selections: [],
			notify(this: SourceUi, message, level) {
				this.notifications.push(`${this.label}:${level ?? "info"}:${message}`);
			},
			async select(this: SourceUi, title, options) {
				observedSelectOptions = options;
				this.selections.push(`${this.label}:${title}:${[...options, "synthetic"].join(",")}`);
				return options[0];
			},
			setStatus(this: SourceUi, key, value) {
				this.statuses.push(`${this.label}:${key}:${value ?? "cleared"}`);
			},
		};
		const commandCtx = {
			cwd: "/repo",
			hasUI: true,
			ui,
			async waitForIdle() {
				idleWaits += 1;
			},
		};

		const selectionCtx = objectiveSelectionContextFromCommandContext(commandCtx);
		const options = ["one", "two"];

		selectionCtx.ui.notify("hello", "warning");
		selectionCtx.ui.setStatus?.("objective", "loading");
		const selected = await selectionCtx.ui.select?.("choose", options);
		await selectionCtx.waitForIdle();

		expect(selectionCtx.cwd).toBe("/repo");
		expect(selectionCtx.hasUI).toBe(true);
		expect(selected).toBe("one");
		expect(observedSelectOptions).not.toBe(options);
		expect(options).toEqual(["one", "two"]);
		expect(ui.notifications).toEqual(["source-ui:warning:hello"]);
		expect(ui.statuses).toEqual(["source-ui:objective:loading"]);
		expect(ui.selections).toEqual(["source-ui:choose:one,two,synthetic"]);
		expect(idleWaits).toBe(1);
	});

	test("skips committed Objective diff when the listed local trunk is not ready", async () => {
		const git = new InMemoryGitGateway({
			statusPaths: { changedPaths: [".ns/objectives/alpha/roadmap.md"] },
		});
		const selections: string[][] = [];
		const slug = await chooseActiveObjectiveSlug(
			{
				clock: createManualClock(0).clock,
				git,
				loadObjectiveList: async () => ({
					type: "loaded",
					list: {
						trunkBranch: "master",
						rootPath: ".ns/objectives",
						statusFilter: "active",
						namesOnly: false,
						records: [
							{
								slug: "alpha",
								status: "open",
								latestUpdateIso: null,
								hasOutstandingChanges: true,
							},
						],
					},
				}),
			},
			{
				cwd: "/repo",
				hasUI: true,
				ui: {
					notify() {},
					select: async (_title, options) => {
						selections.push([...options]);
						return options[0];
					},
				},
				async waitForIdle() {},
			},
			{ statusKey: "objective", selectionTitle: "Select an Objective" },
		);

		expect(slug).toBe("alpha");
		expect(git.exactRefPresenceCalls).toEqual([{ cwd: "/repo", ref: "refs/heads/master" }]);
		expect(git.changedPathsUnderCalls).toEqual([]);
		expect(selections[0]?.[0]).toContain("changed in checkout");
	});

	test("omits optional UI capabilities and normalizes absent hasUI", () => {
		const selectionCtx = objectiveSelectionContextFromCommandContext({
			cwd: "/repo",
			ui: {
				notify() {},
			},
			async waitForIdle() {},
		});

		expect(selectionCtx.hasUI).toBe(false);
		expect(selectionCtx.ui.select).toBeUndefined();
		expect(selectionCtx.ui.setStatus).toBeUndefined();
	});
});
