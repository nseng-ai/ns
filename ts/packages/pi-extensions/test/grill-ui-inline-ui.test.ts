import { describe, expect, test } from "bun:test";

import { GrillAskController } from "../src/grill-ui/controller.ts";
import {
	createGrillAskInlineComponent,
	runGrillAskInlineUiWithRuntime,
	type GrillAskInlineRuntime,
} from "../src/grill-ui/inline-ui.ts";
import { renderGrillAskInlineUi } from "../src/grill-ui/render.ts";
import {
	buildGrillAskRows,
	choiceDetailLines,
	defaultGrillAskRowIndex,
	rowLabel,
	rowRecommendationTag,
	rowValue,
} from "../src/grill-ui/view.ts";
import type { GrillAskCustomComponent, GrillAskToolContext, NormalizedGrillAskInput } from "../src/grill-ui.ts";

function normalizedInput(overrides: Partial<NormalizedGrillAskInput> = {}): NormalizedGrillAskInput {
	return {
		question: "How should the inline UI ship?",
		context: "We need a better grill prompt interaction without changing the model contract.",
		recommended: {
			answer: "Ship the focused inline UI.",
			rationale: "It improves the user interaction while preserving the tool result shape.",
			optionValue: "inline-ui",
		},
		options: [
			{
				value: "legacy",
				label: "Keep the legacy dialogs",
				description: "This is safe but keeps the awkward two-dialog freeform flow.",
			},
			{
				value: "inline-ui",
				label: "Ship the focused inline UI",
				description: "Use one custom inline UI with visible exceptional rows.",
			},
		],
		allowFreeform: true,
		allowEnd: true,
		...overrides,
	};
}

describe("grill_ask view helpers", () => {
	test("build rows with visible exceptional rows and recommended default focus", () => {
		const input = normalizedInput();
		const rows = buildGrillAskRows(input);

		expect(rows.map((row) => row.kind)).toEqual(["choice", "choice", "freeform", "end_grill"]);
		expect(rowValue(rows[2]!)).toBe("__freeform__");
		expect(rowValue(rows[3]!)).toBe("__end_grill__");
		expect(rowLabel(rows[1]!)).toBe("2. Ship the focused inline UI");
		expect(rowLabel(rows[2]!)).toBe("3. Other / freeform answer");
		expect(rowLabel(rows[3]!)).toBe("4. End grilling session");
		expect(rowLabel(rows[1]!)).not.toContain("(recommended)");
		expect(rowRecommendationTag(rows[1]!)).toBe("★ recommended");
		expect(rowRecommendationTag(rows[0]!)).toBeUndefined();
		expect(choiceDetailLines(input, rows[1]!)).toEqual([
			"Use one custom inline UI with visible exceptional rows.",
			"Why: It improves the user interaction while preserving the tool result shape.",
		]);
		expect(defaultGrillAskRowIndex(input, rows)).toBe(1);
	});
});

describe("GrillAskController", () => {
	test("moves focus with clamping and submits choice/end outcomes", () => {
		const controller = new GrillAskController(normalizedInput());

		expect(controller.focusIndex).toBe(1);
		controller.moveFocus(-10);
		expect(controller.focusIndex).toBe(0);
		controller.moveFocus(99);
		expect(controller.focusIndex).toBe(3);
		expect(controller.submitFocused()).toEqual({ action: "end_grill" });
	});

	test("freeform escape returns to choices and empty submit stays open", () => {
		const controller = new GrillAskController(normalizedInput());

		controller.setFocus(2);
		expect(controller.submitFocused()).toBeUndefined();
		expect(controller.mode).toBe("freeform");
		expect(controller.submitFreeform("   ")).toBeUndefined();
		expect(controller.escape()).toBeUndefined();
		expect(controller.mode).toBe("choices");
		expect(controller.escape()).toEqual({ action: "cancelled" });
	});
});

describe("grill_ask render helpers", () => {
	test("mapped recommendation is folded into the focused choice row", () => {
		const input = normalizedInput();
		const controller = new GrillAskController(input);
		const lines = renderGrillAskInlineUi(input, { mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex }, 72);
		const output = lines.join("\n");

		expect(output).toContain("How should the inline UI ship?");
		expect(output).toContain("We need a better grill prompt interaction");
		expect(output).toContain("★ recommended");
		expect(output).toContain("Use one custom inline UI with visible exceptional rows.");
		expect(output).toContain("Why: It improves the user interaction while preserving the tool");
		expect(output).toContain("3  ✎ Other / freeform answer");
		expect(output).toContain("4  ⏹ End grilling session");
		expect(output).not.toContain("Question");
		expect(output).not.toContain("Context");
		expect(output).not.toContain("Recommendation");
		expect(output).not.toContain("Choices");
		expect(output).not.toContain("Other paths");
		expect(output).toContain("↑↓/j/k navigate • number/Enter select • Esc cancel");
		expect(output).toContain("This is safe but keeps the awkward two-dialog freeform flow.");
		expect(lines.every((line) => line.length <= 72)).toBe(true);
	});

	test("all choice descriptions stay visible while the focus marker follows selection", () => {
		const input = normalizedInput();
		const rows = buildGrillAskRows(input);
		const firstFocused = renderGrillAskInlineUi(input, { mode: "choices", rows, focusIndex: 0 }, 90).join("\n");
		const secondFocused = renderGrillAskInlineUi(input, { mode: "choices", rows, focusIndex: 1 }, 90).join("\n");

		for (const output of [firstFocused, secondFocused]) {
			expect(output).toContain("This is safe but keeps the awkward two-dialog freeform flow.");
			expect(output).toContain("Use one custom inline UI with visible exceptional rows.");
		}
		expect(firstFocused).toContain("Why: It improves the user interaction");
		expect(secondFocused).toContain("Why: It improves the user interaction");
		expect(firstFocused).toContain("❯ 1  Keep the legacy dialogs");
		expect(secondFocused).toContain("❯ 2  Ship the focused inline UI");
	});

	test("unmapped recommendation renders as compact read-zone support", () => {
		const input = normalizedInput({
			recommended: {
				answer: "Start with the conservative implementation.",
				rationale: "It is the lowest-risk next step.",
			},
		});
		const controller = new GrillAskController(input);
		const lines = renderGrillAskInlineUi(input, { mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex }, 80);
		const output = lines.join("\n");

		expect(output).toContain("Recommended: Start with the conservative implementation.");
		expect(output).toContain("Why: It is the lowest-risk next step.");
		expect(output).not.toContain("★ recommended");
		expect(output).not.toContain("Recommendation");
		expect(lines.every((line) => line.length <= 80)).toBe(true);
	});

	test("wide render stays single-column without split-preview separators", () => {
		const input = normalizedInput();
		const controller = new GrillAskController(input);
		const lines = renderGrillAskInlineUi(input, { mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex }, 120);
		const output = lines.join("\n");

		expect(output).toContain("★ recommended");
		expect(output).not.toContain("Choices");
		expect(output).not.toContain("│");
		expect(lines.every((line) => line.length <= 120)).toBe(true);
	});
});

describe("grill_ask inline UI component", () => {
	test("runs ctx.ui.custom inline without overlay/modal options", async () => {
		let observedOptions: unknown = "unset";
		const result = await runGrillAskInlineUiWithRuntime(
			normalizedInput(),
			{
				hasUI: true,
				ui: {
					custom: async <T>(
						factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => GrillAskCustomComponent,
						options: unknown,
					) => {
						observedOptions = options;
						return new Promise<T>((resolve) => {
							const component = factory(fakeTui(), {}, {}, resolve);
							component.handleInput?.("enter");
						});
					},
				},
			} satisfies GrillAskToolContext,
			fakeRuntime(),
		);

		expect(observedOptions).toBeUndefined();
		expect(result).toEqual({
			action: "choice",
			entry: expect.objectContaining({ kind: "choice", option: expect.objectContaining({ value: "inline-ui" }) }),
		});
	});

	test("Enter on a choice returns a choice outcome", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => doneValues.push(outcome),
		);

		component.handleInput?.("enter");

		expect(doneValues).toEqual([
			{
				action: "choice",
				entry: expect.objectContaining({ kind: "choice", recommended: true }),
			},
		]);
	});

	test("j/k move focus and number shortcuts select visible rows", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => doneValues.push(outcome),
		);

		component.handleInput?.("k");
		component.handleInput?.("enter");

		expect(doneValues).toEqual([
			{
				action: "choice",
				entry: expect.objectContaining({ kind: "choice", option: expect.objectContaining({ value: "legacy" }) }),
			},
		]);

		const shortcutDoneValues: unknown[] = [];
		const shortcutComponent = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => shortcutDoneValues.push(outcome),
		);
		shortcutComponent.handleInput?.("1");

		expect(shortcutDoneValues).toEqual([
			{
				action: "choice",
				entry: expect.objectContaining({ kind: "choice", option: expect.objectContaining({ value: "legacy" }) }),
			},
		]);
	});

	test("numbered exceptional rows open freeform and end grilling", () => {
		const freeformDoneValues: unknown[] = [];
		const freeformComponent = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => freeformDoneValues.push(outcome),
		);

		freeformComponent.handleInput?.("3");
		freeformComponent.handleInput?.("O");
		freeformComponent.handleInput?.("k");
		freeformComponent.handleInput?.("enter");

		expect(freeformDoneValues).toEqual([{ action: "freeform", answer: "Ok" }]);

		const endDoneValues: unknown[] = [];
		const endComponent = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => endDoneValues.push(outcome),
		);
		endComponent.handleInput?.("4");

		expect(endDoneValues).toEqual([{ action: "end_grill" }]);
	});

	test("Other opens inline freeform and submits non-empty editor text", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => doneValues.push(outcome),
		);

		component.handleInput?.("down");
		component.handleInput?.("enter");
		component.handleInput?.("A");
		component.handleInput?.("n");
		component.handleInput?.("enter");

		expect(doneValues).toEqual([{ action: "freeform", answer: "An" }]);
	});

	test("Esc inside freeform returns to choices before cancelling", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => doneValues.push(outcome),
		);

		component.handleInput?.("down");
		component.handleInput?.("enter");
		component.handleInput?.("escape");
		expect(doneValues).toEqual([]);

		component.handleInput?.("escape");
		expect(doneValues).toEqual([{ action: "cancelled" }]);
	});
});

function fakeRuntime(): GrillAskInlineRuntime {
	return {
		Editor: FakeEditor,
		Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
		matchesKey: (data, key) => data === key,
		truncateToWidth: (value, width) => (value.length <= width ? value : value.slice(0, Math.max(0, width - 1)) + "…"),
		wrapTextWithAnsi: (value, width) => wrapPlain(value, width),
		visibleWidth: (value) => value.length,
	};
}

function fakeTui(): { requestRender(): void } {
	return { requestRender: () => {} };
}

class FakeEditor {
	focused = false;
	onSubmit?: (value: string) => void;
	private text = "";

	constructor(_tui: unknown, _theme: unknown) {}

	setText(value: string): void {
		this.text = value;
	}

	render(_width: number): string[] {
		return [this.text];
	}

	handleInput(data: string): void {
		if (data === "enter") {
			this.onSubmit?.(this.text);
			return;
		}
		if (data.length === 1) {
			this.text += data;
		}
	}

	invalidate(): void {}
}

function wrapPlain(value: string, width: number): string[] {
	if (value.length <= width) return [value];
	const lines: string[] = [];
	for (let index = 0; index < value.length; index += width) {
		lines.push(value.slice(index, index + width));
	}
	return lines;
}
