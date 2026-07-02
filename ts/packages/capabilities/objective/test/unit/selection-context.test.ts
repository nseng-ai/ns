import { describe, expect, test } from "vitest";

import {
	objectiveSelectionContextFromCommandContext,
	type ObjectiveSelectionCommandUi,
} from "../../src/core/api.ts";

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
