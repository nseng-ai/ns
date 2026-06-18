import { describe, expect, test } from "vitest";

import { stackMapTabModule } from "../../src/stack-map-tab.ts";
import {
	createInitialStackMapState,
	type StackMapModel,
	type StackMapState,
} from "../../src/stack-map.ts";

const MODEL: StackMapModel = {
	title: "stack map",
	diagnostics: [],
	currentBranch: "feature/current",
	trunk: {
		name: "main",
		graphiteNote: "repo",
		children: [{ name: "feature/current", graphiteNote: "current" }],
	},
};

function rowsState(): StackMapState {
	return createInitialStackMapState(MODEL);
}

describe("stackMapTabModule.interpretKey mapping", () => {
	test("maps movement keys to action intents", () => {
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "down" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: 1 },
		});
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "up" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: -1 },
		});
	});

	test("maps q and escape to quit", () => {
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "q" })).toEqual({ type: "quit" });
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "escape" })).toEqual({
			type: "quit",
		});
	});

	test("maps the cmux key to an activate-cmux effect", () => {
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "c" })).toEqual({
			type: "effect",
			effect: { type: "activate-cmux" },
		});
	});

	test("maps chooser confirmation to an activate-choice effect", () => {
		const chooserState: StackMapState = {
			...rowsState(),
			mode: {
				type: "cmux-choice",
				branch: "feature/current",
				choices: [{ type: "open-new", branch: "feature/current" }],
				selectedIndex: 0,
			},
		};
		expect(stackMapTabModule.interpretKey(chooserState, { name: "enter" })).toEqual({
			type: "effect",
			effect: { type: "activate-choice" },
		});
	});

	test("maps unhandled keys to none", () => {
		expect(stackMapTabModule.interpretKey(rowsState(), { name: "z" })).toEqual({ type: "none" });
	});

	test("renders the stack-map frame split into lines", () => {
		const lines = stackMapTabModule.render(MODEL, rowsState());
		expect(Array.isArray(lines)).toBe(true);
		expect(lines[0]).toBe("stack map");
		expect(lines.some((line) => line.includes("feature/current"))).toBe(true);
	});
});
