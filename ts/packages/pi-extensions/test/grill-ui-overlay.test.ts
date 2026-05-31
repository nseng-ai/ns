import { describe, expect, test } from "bun:test";

import { GrillAskController } from "../src/grill-ui/controller.ts";
import { createGrillAskOverlayComponent, type GrillAskOverlayRuntime } from "../src/grill-ui/overlay.ts";
import { renderGrillAskOverlay } from "../src/grill-ui/render.ts";
import {
	buildGrillAskRows,
	defaultGrillAskRowIndex,
	previewTextForRow,
	rowLabel,
	rowValue,
	shouldUseSplitPreview,
} from "../src/grill-ui/view.ts";
import type { NormalizedGrillAskInput } from "../src/grill-ui.ts";

function normalizedInput(overrides: Partial<NormalizedGrillAskInput> = {}): NormalizedGrillAskInput {
	return {
		question: "How should the overlay ship?",
		context: "We need a better grill prompt interaction without changing the model contract.",
		recommended: {
			answer: "Ship the focused overlay.",
			rationale: "It improves the user interaction while preserving the tool result shape.",
			optionValue: "overlay",
		},
		options: [
			{
				value: "legacy",
				label: "Keep the legacy dialogs",
				description: "This is safe but keeps the awkward two-dialog freeform flow.",
			},
			{
				value: "overlay",
				label: "Ship the focused overlay",
				description: "Use one custom overlay with visible exceptional rows.",
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
		expect(rowLabel(rows[1]!)).toContain("(recommended)");
		expect(defaultGrillAskRowIndex(input, rows)).toBe(1);
		expect(previewTextForRow(input, rows[1]!)).toContain("Rationale:");
	});

	test("wide terminals use split preview", () => {
		expect(shouldUseSplitPreview(99)).toBe(false);
		expect(shouldUseSplitPreview(100)).toBe(true);
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
	test("narrow render stacks descriptions and keeps lines within width", () => {
		const input = normalizedInput();
		const controller = new GrillAskController(input);
		const lines = renderGrillAskOverlay(input, { mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex }, 72);

		expect(lines.join("\n")).toContain("Use one custom overlay");
		expect(lines.join("\n")).toContain("Preview:");
		expect(lines.every((line) => line.length <= 72)).toBe(true);
	});

	test("wide render uses a focused preview panel", () => {
		const input = normalizedInput();
		const controller = new GrillAskController(input);
		const lines = renderGrillAskOverlay(input, { mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex }, 120);

		expect(lines.join("\n")).toContain("Preview");
		expect(lines.join("\n")).toContain("Rationale:");
		expect(lines.every((line) => line.length <= 120)).toBe(true);
	});
});

describe("grill_ask overlay component", () => {
	test("Enter on a choice returns a choice outcome", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskOverlayComponent(
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

	test("Other opens inline freeform and submits non-empty editor text", () => {
		const doneValues: unknown[] = [];
		const component = createGrillAskOverlayComponent(
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
		const component = createGrillAskOverlayComponent(
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

function fakeRuntime(): GrillAskOverlayRuntime {
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
