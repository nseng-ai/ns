import { describe, expect, test } from "vitest";

import { GrillAskController } from "../src/grill-ui/controller.ts";
import {
	createGrillAskInlineComponent,
	grillAskInlineRuntimeFromModule,
	grillAskRenderThemeFromValue,
	markdownThemeFromCodingAgentModule,
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
	rowSelectDisplay,
	rowValue,
} from "../src/grill-ui/view.ts";
import type {
	GrillAskCustomComponent,
	GrillAskToolContext,
	NormalizedGrillAskInput,
} from "../src/grill-ui.ts";

function normalizedInput(
	overrides: Partial<NormalizedGrillAskInput> = {},
): NormalizedGrillAskInput {
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

		expect(rows.map((row) => row.kind)).toEqual([
			"choice",
			"choice",
			"freeform",
			"status",
			"end_grill",
		]);
		expect(rowValue(rows[2]!)).toBe("__freeform__");
		expect(rowValue(rows[3]!)).toBe("__status__");
		expect(rowValue(rows[4]!)).toBe("__end_grill__");
		expect(rowLabel(rows[1]!)).toBe("2. Ship the focused inline UI");
		expect(rowLabel(rows[2]!)).toBe("3. Other / freeform answer");
		expect(rowLabel(rows[3]!)).toBe("4. Show current grill status");
		expect(rowLabel(rows[4]!)).toBe("5. End grilling session");
		expect(rowLabel(rows[1]!)).not.toContain("(recommended)");
		expect(rowSelectDisplay(rows[1]!)).toBe(
			"2. ★ Ship the focused inline UI — Use one custom inline UI with visible exceptional rows.",
		);
		expect(rowSelectDisplay(rows[2]!)).toBe("3. ✎ Other / freeform answer");
		expect(rowSelectDisplay(rows[3]!)).toBe("4. ℹ Show current grill status");
		expect(rowSelectDisplay(rows[4]!)).toBe("5. ⏹ End grilling session");
		expect(rowRecommendationTag(rows[1]!)).toBe("★ recommended");
		expect(rowRecommendationTag(rows[0]!)).toBeUndefined();
		expect(choiceDetailLines(input, rows[1]!)).toEqual([
			"Use one custom inline UI with visible exceptional rows.",
			"Why: It improves the user interaction while preserving the tool result shape.",
		]);
		expect(defaultGrillAskRowIndex(input, rows)).toBe(1);
	});

	test("always includes status when freeform and end are disabled", () => {
		const rows = buildGrillAskRows(normalizedInput({ allowFreeform: false, allowEnd: false }));

		expect(rows.map((row) => row.kind)).toEqual(["choice", "choice", "status"]);
		expect(rowLabel(rows[2]!)).toBe("3. Show current grill status");
	});
});

describe("GrillAskController", () => {
	test("moves focus with clamping and submits choice/end outcomes", () => {
		const controller = new GrillAskController(normalizedInput());

		expect(controller.focusIndex).toBe(1);
		controller.moveFocus(-10);
		expect(controller.focusIndex).toBe(0);
		controller.setFocus(3);
		expect(controller.submitFocused()).toEqual({ action: "status_request" });
		controller.moveFocus(99);
		expect(controller.focusIndex).toBe(4);
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
		const lines = renderGrillAskInlineUi(
			input,
			{ mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex },
			72,
		);
		const output = lines.join("\n");

		expect(output).toContain("How should the inline UI ship?");
		expect(output).toContain("We need a better grill prompt interaction");
		expect(output).toContain("★ recommended");
		expect(output).toContain("Use one custom inline UI with visible exceptional rows.");
		expect(output).toContain("Why: It improves the user interaction while preserving the tool");
		expect(output).toContain("3  ✎ Other / freeform answer");
		expect(output).toContain("4  ℹ Show current grill status");
		expect(output).toContain("5  ⏹ End grilling session");
		expect(output).toContain("Question unknown • Answered unknown • Remaining unknown");
		expect(output).not.toContain("Question:");
		expect(output).not.toContain("Context");
		expect(output).not.toContain("Recommendation");
		expect(output).not.toContain("Choices");
		expect(output).not.toContain("Other paths");
		expect(output).toContain("↑↓/j/k navigate • number/Enter select • Esc cancel");
		expect(output).toContain("This is safe but keeps the awkward two-dialog freeform flow.");
		expect(lines.every((line) => line.length <= 72)).toBe(true);
	});

	test("renders current question number, answered count, and supplied remaining estimate", () => {
		const input = normalizedInput({
			estimatedRemaining: {
				kind: "range",
				min: 2,
				max: 5,
				basis: "API and fallback rendering are still open",
			},
		});
		const rows = buildGrillAskRows(input);
		const output = renderGrillAskInlineUi(
			input,
			{
				mode: "choices",
				rows,
				focusIndex: 1,
				progress: { answeredQuestions: 3, source: "session_branch" },
			},
			90,
		).join("\n");

		expect(output).toContain(
			"Question 4 • Answered 3 • Remaining 2–5 (rough: API and fallback rendering are still open)",
		);
	});

	test("renders the session state line with subtly colorized values", () => {
		const input = normalizedInput({
			estimatedRemaining: {
				kind: "range",
				min: 2,
				max: 4,
				basis: "after selecting the target behavior",
			},
		});
		const rows = buildGrillAskRows(input);
		const theme = {
			fg: (color: string, text: string) => `[${color}]${text}`,
			bold: (text: string) => `**${text}**`,
		};
		const output = renderGrillAskInlineUi(
			input,
			{
				mode: "choices",
				rows,
				focusIndex: 1,
				progress: { answeredQuestions: 0, source: "session_branch" },
			},
			160,
			theme,
		).join("\n");

		expect(output).toContain(
			"Question [accent]1 • Answered [success]0[muted] • Remaining [warning]2–4 [dim](rough: after selecting the target behavior)",
		);
		expect(output).not.toContain("[dim]Question");
		expect(output).not.toContain("**Question");
	});

	test("all choice descriptions stay visible while the focus marker follows selection", () => {
		const input = normalizedInput();
		const rows = buildGrillAskRows(input);
		const firstFocused = renderGrillAskInlineUi(
			input,
			{ mode: "choices", rows, focusIndex: 0 },
			90,
		).join("\n");
		const secondFocused = renderGrillAskInlineUi(
			input,
			{ mode: "choices", rows, focusIndex: 1 },
			90,
		).join("\n");

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
		const lines = renderGrillAskInlineUi(
			input,
			{ mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex },
			80,
		);
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
		const lines = renderGrillAskInlineUi(
			input,
			{ mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex },
			120,
		);
		const output = lines.join("\n");

		expect(output).toContain("★ recommended");
		expect(output).not.toContain("Choices");
		expect(output).not.toContain("│");
		expect(lines.every((line) => line.length <= 120)).toBe(true);
	});
});

describe("grill_ask inline runtime boundary helpers", () => {
	test("normalizes valid Pi TUI-like module exports", () => {
		const markdownTheme = { name: "markdown-theme" };
		const runtime = grillAskInlineRuntimeFromModule(
			fakeRuntimeModule({
				Key: { up: "ArrowUp", enter: "Enter" },
				wrapTextWithAnsi: (value: string, width: number) => [value.slice(0, width)],
				visibleWidth: (value: string) => value.length,
				Markdown: FakeMarkdown,
			}),
			markdownTheme,
		);

		expect(runtime.Editor).toBe(FakeEditor);
		expect(runtime.Key).toEqual({ up: "ArrowUp", enter: "Enter" });
		expect(runtime.matchesKey("Enter", "Enter")).toBe(true);
		expect(runtime.truncateToWidth("abcdef", 3)).toBe("abc");
		expect(runtime.wrapTextWithAnsi?.("abcdef", 2)).toEqual(["ab"]);
		expect(runtime.visibleWidth?.("abc")).toBe(3);
		expect(runtime.Markdown).toBe(FakeMarkdown);
		expect(runtime.markdownTheme).toBe(markdownTheme);
	});

	test("rejects missing or malformed required Pi TUI exports", () => {
		expect(() => grillAskInlineRuntimeFromModule({}, undefined)).toThrow(
			"Pi TUI runtime does not provide",
		);
		expect(() =>
			grillAskInlineRuntimeFromModule(
				fakeRuntimeModule({
					matchesKey: "not callable",
				}),
				undefined,
			),
		).toThrow("Pi TUI runtime does not provide");
	});

	test("ignores malformed optional Pi TUI exports", () => {
		const runtime = grillAskInlineRuntimeFromModule(
			fakeRuntimeModule({
				Key: { up: "up", down: 42 },
				wrapTextWithAnsi: "not callable",
				visibleWidth: "not callable",
				Markdown: { render: () => [] },
			}),
			undefined,
		);

		expect(runtime.Key).toBeUndefined();
		expect(runtime.wrapTextWithAnsi).toBeUndefined();
		expect(runtime.visibleWidth).toBeUndefined();
		expect(runtime.Markdown).toBeUndefined();
		expect(runtime.markdownTheme).toBeUndefined();
		expect(runtime.matchesKey("enter", "enter")).toBe(true);
	});

	test("reads markdown theme only from a callable coding-agent export", () => {
		const sentinel = { name: "theme" };

		expect(markdownThemeFromCodingAgentModule({ getMarkdownTheme: () => sentinel })).toBe(sentinel);
		expect(markdownThemeFromCodingAgentModule({})).toBeUndefined();
		expect(
			markdownThemeFromCodingAgentModule({ getMarkdownTheme: "not callable" }),
		).toBeUndefined();
		expect(markdownThemeFromCodingAgentModule([])).toBeUndefined();
	});

	test("normalizes custom UI themes to callable render functions", () => {
		const fg = (color: string, text: string) => `${color}:${text}`;
		const bg = (color: string, text: string) => `${color}:${text}`;
		const bold = (text: string) => `**${text}**`;

		const theme = grillAskRenderThemeFromValue({ fg, bg: "not callable", bold });
		expect(theme.fg?.("accent", "text")).toBe("accent:text");
		expect(theme.bg).toBeUndefined();
		expect(theme.bold?.("text")).toBe("**text**");
		expect(grillAskRenderThemeFromValue({ fg, bg, bold }).bg?.("selectedBg", "text")).toBe(
			"selectedBg:text",
		);
		expect(grillAskRenderThemeFromValue(null)).toEqual({});
		expect(grillAskRenderThemeFromValue([])).toEqual({});
	});

	test("preserves the receiver for Pi Theme-like methods", () => {
		interface PiThemeLike {
			fgColors: Map<string, string>;
			bgColors: Map<string, string>;
			emphasis: string;
			fg(this: PiThemeLike, color: string, text: string): string;
			bg(this: PiThemeLike, color: string, text: string): string;
			bold(this: PiThemeLike, text: string): string;
		}

		const piTheme: PiThemeLike = {
			fgColors: new Map([
				["accent", "fg-accent"],
				["dim", "fg-dim"],
				["muted", "fg-muted"],
				["text", "fg-text"],
				["warning", "fg-warning"],
			]),
			bgColors: new Map([["selectedBg", "bg-selected"]]),
			emphasis: "bold",
			fg(color, text) {
				return `${this.fgColors.get(color) ?? "fg-missing"}:${text}`;
			},
			bg(color, text) {
				return `${this.bgColors.get(color) ?? "bg-missing"}:${text}`;
			},
			bold(text) {
				return `${this.emphasis}:${text}`;
			},
		};

		const theme = grillAskRenderThemeFromValue(piTheme);
		expect(theme.fg?.("accent", "grill")).toBe("fg-accent:grill");
		expect(theme.bg?.("selectedBg", "selected")).toBe("bg-selected:selected");
		expect(theme.bold?.("question")).toBe("bold:question");

		const input = normalizedInput();
		const controller = new GrillAskController(input);
		expect(() =>
			renderGrillAskInlineUi(
				input,
				{ mode: controller.mode, rows: controller.rows, focusIndex: controller.focusIndex },
				72,
				theme,
			),
		).not.toThrow();
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
						factory: (
							tui: unknown,
							theme: unknown,
							keybindings: unknown,
							done: (value: T) => void,
						) => GrillAskCustomComponent,
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
			entry: expect.objectContaining({
				kind: "choice",
				option: expect.objectContaining({ value: "inline-ui" }),
			}),
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
				entry: expect.objectContaining({
					kind: "choice",
					option: expect.objectContaining({ value: "legacy" }),
				}),
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
				entry: expect.objectContaining({
					kind: "choice",
					option: expect.objectContaining({ value: "legacy" }),
				}),
			},
		]);
	});

	test("numbered exceptional rows open freeform, status, and end grilling", () => {
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

		const statusDoneValues: unknown[] = [];
		const statusComponent = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => statusDoneValues.push(outcome),
		);
		statusComponent.handleInput?.("4");

		expect(statusDoneValues).toEqual([{ action: "status_request" }]);

		const endDoneValues: unknown[] = [];
		const endComponent = createGrillAskInlineComponent(
			normalizedInput(),
			fakeRuntime(),
			fakeTui(),
			{},
			(outcome) => endDoneValues.push(outcome),
		);
		endComponent.handleInput?.("5");

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
		truncateToWidth: (value, width) =>
			value.length <= width ? value : value.slice(0, Math.max(0, width - 1)) + "…",
		wrapTextWithAnsi: (value, width) => wrapPlain(value, width),
		visibleWidth: (value) => value.length,
	};
}

function fakeRuntimeModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		Editor: FakeEditor,
		matchesKey: (data: string, key: string) => data === key,
		truncateToWidth: (value: string, width: number) => value.slice(0, width),
		...overrides,
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

class FakeMarkdown {
	private readonly text: string;

	constructor(text: string, _paddingX: number, _paddingY: number, _theme: unknown) {
		this.text = text;
	}

	render(width: number): string[] {
		return [this.text.slice(0, width)];
	}
}

function wrapPlain(value: string, width: number): string[] {
	if (value.length <= width) return [value];
	const lines: string[] = [];
	for (let index = 0; index < value.length; index += width) {
		lines.push(value.slice(index, index + width));
	}
	return lines;
}
