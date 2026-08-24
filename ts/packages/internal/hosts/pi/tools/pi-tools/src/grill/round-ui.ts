import { GrillRoundController } from "./round-controller.ts";
import type {
	GrillConfirmationUiOutcome,
	GrillDecisionRoundInput,
	GrillDecisionRoundUiOutcome,
	GrillRoundCustomComponent,
	GrillRoundInput,
	GrillRoundToolContext,
	GrillRoundUiOutcome,
} from "./round-protocol.ts";

interface EditorLike {
	focused?: boolean;
	onSubmit?: (value: string) => void;
	setText(value: string): void;
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate?(): void;
}

type EditorConstructor = new (tui: unknown, theme: unknown) => EditorLike;

export interface GrillRoundInlineRuntime {
	Editor: EditorConstructor;
	Key?: Record<string, string>;
	matchesKey(data: string, key: string): boolean;
	truncateToWidth(value: string, width: number, ellipsis?: string): string;
}

/** One custom call owns every draft, navigation state, status view, review, and completion. */
export function runGrillRoundInlineUi(
	input: GrillDecisionRoundInput,
	ctx: GrillRoundToolContext,
): Promise<GrillDecisionRoundUiOutcome | undefined>;
export function runGrillRoundInlineUi(
	input: Extract<GrillRoundInput, { mode: "confirmation" }>,
	ctx: GrillRoundToolContext,
): Promise<GrillConfirmationUiOutcome | undefined>;
export async function runGrillRoundInlineUi(
	input: GrillRoundInput,
	ctx: GrillRoundToolContext,
): Promise<GrillRoundUiOutcome | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return undefined;
	const moduleValue: unknown = await import("@earendil-works/pi-tui");
	const runtime = grillRoundInlineRuntimeFromModule(moduleValue);
	return runGrillRoundInlineUiWithRuntime(input, ctx, runtime);
}

export function runGrillRoundInlineUiWithRuntime(
	input: GrillRoundInput,
	ctx: GrillRoundToolContext,
	runtime: GrillRoundInlineRuntime,
): Promise<GrillRoundUiOutcome | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return Promise.resolve(undefined);
	if (input.mode === "confirmation") {
		return ctx.ui.custom<GrillConfirmationUiOutcome>(
			(_tui, _theme, _keybindings, done) =>
				new GrillConfirmationInlineUi(input.summary, runtime, done),
		);
	}
	return ctx.ui.custom<GrillDecisionRoundUiOutcome>(
		(tui, theme, _keybindings, done) =>
			new GrillDecisionRoundInlineUi({ input, runtime, tui, theme, done }),
	);
}

export function grillRoundInlineRuntimeFromModule(value: unknown): GrillRoundInlineRuntime {
	if (!isRecord(value)) throw missingRuntimeError();
	if (
		typeof value.Editor !== "function" ||
		typeof value.matchesKey !== "function" ||
		typeof value.truncateToWidth !== "function"
	) {
		throw missingRuntimeError();
	}
	return {
		Editor: value.Editor as EditorConstructor,
		matchesKey: value.matchesKey as GrillRoundInlineRuntime["matchesKey"],
		truncateToWidth: value.truncateToWidth as GrillRoundInlineRuntime["truncateToWidth"],
		...(isStringRecord(value.Key) ? { Key: value.Key } : {}),
	};
}

interface GrillRoundInlineUiOptions {
	input: GrillDecisionRoundInput;
	runtime: GrillRoundInlineRuntime;
	tui: unknown;
	theme: unknown;
	done: (outcome: GrillDecisionRoundUiOutcome) => void;
}

class GrillDecisionRoundInlineUi implements GrillRoundCustomComponent {
	private readonly input: GrillDecisionRoundInput;
	private readonly runtime: GrillRoundInlineRuntime;
	private readonly tui: unknown;
	private readonly done: (outcome: GrillDecisionRoundUiOutcome) => void;
	private readonly controller: GrillRoundController;
	private readonly editor: EditorLike;
	private focusedValue = false;

	constructor(options: GrillRoundInlineUiOptions) {
		this.input = options.input;
		this.runtime = options.runtime;
		this.tui = options.tui;
		this.done = options.done;
		this.controller = new GrillRoundController(options.input);
		this.editor = new options.runtime.Editor(options.tui, editorTheme(options.theme));
		this.editor.onSubmit = (value) => {
			if (this.controller.submitFreeform(value)) this.editor.setText("");
			this.requestRender();
		};
	}

	get focused(): boolean {
		return this.focusedValue;
	}

	set focused(value: boolean) {
		this.focusedValue = value;
		this.editor.focused = value;
	}

	handleInput(data: string): void {
		if (this.controller.view === "freeform") {
			if (matches(this.runtime, data, "escape")) {
				this.controller.returnToQuestion();
				this.requestRender();
				return;
			}
			this.editor.handleInput(data);
			this.requestRender();
			return;
		}
		if (this.controller.view === "status" || this.controller.view === "review") {
			if (data === "b" || matches(this.runtime, data, "escape")) {
				this.controller.returnToQuestion();
				this.requestRender();
				return;
			}
			if (this.controller.view === "review" && matches(this.runtime, data, "enter")) {
				const outcome = this.controller.submit();
				if (outcome !== undefined) this.done(outcome);
			}
			return;
		}
		if (matches(this.runtime, data, "left") || data === "h") this.controller.move(-1);
		else if (matches(this.runtime, data, "right") || data === "l") this.controller.move(1);
		else if (/^[1-5]$/.test(data)) this.controller.selectOption(Number.parseInt(data, 10) - 1);
		else if (data === "f") this.controller.openFreeform();
		else if (data === "s") this.controller.showStatus();
		else if (data === "v") this.controller.showReview();
		else if (data === "e") this.done({ action: "ended" });
		else if (matches(this.runtime, data, "escape")) this.done({ action: "cancelled" });
		this.requestRender();
	}

	render(width: number): string[] {
		const lines = renderDecisionRound(
			this.input,
			this.controller,
			this.editor,
			Math.max(1, width - 2),
		);
		return lines.map((line) => this.runtime.truncateToWidth(line, Math.max(1, width)));
	}

	invalidate(): void {
		this.editor.invalidate?.();
	}

	private requestRender(): void {
		if (isRecord(this.tui) && typeof this.tui.requestRender === "function") {
			this.tui.requestRender();
		}
	}
}

class GrillConfirmationInlineUi implements GrillRoundCustomComponent {
	private readonly summary: string;
	private readonly runtime: GrillRoundInlineRuntime;
	private readonly done: (outcome: GrillConfirmationUiOutcome) => void;

	constructor(
		summary: string,
		runtime: GrillRoundInlineRuntime,
		done: (outcome: GrillConfirmationUiOutcome) => void,
	) {
		this.summary = summary;
		this.runtime = runtime;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matches(this.runtime, data, "enter") || data === "c") this.done({ action: "confirmed" });
		else if (data === "r" || matches(this.runtime, data, "escape")) {
			this.done({ action: "return-to-grilling" });
		}
	}

	render(width: number): string[] {
		return [
			"Confirm shared understanding",
			"",
			...this.summary.split("\n"),
			"",
			"Enter/c  Confirm shared understanding",
			"r/Esc    Return to grilling",
		].map((line) => this.runtime.truncateToWidth(line, Math.max(1, width)));
	}

	invalidate(): void {}
}

function renderDecisionRound(
	input: Extract<GrillRoundInput, { mode: "decision-round" }>,
	controller: GrillRoundController,
	editor: EditorLike,
	editorWidth: number,
): string[] {
	const header = `Decision round ${input.roundId} • ${controller.questionIndex + 1}/${input.questions.length}`;
	const oversized =
		input.questions.length > 8
			? ["Warning: large frontier; use compact navigation and review every answer."]
			: [];
	if (controller.view === "status") {
		return [
			header,
			...oversized,
			`Status: ${input.questions.length} decisions drafted; recommendations preselected.`,
			`Current: ${input.questions[controller.questionIndex]?.id ?? "unknown"}`,
			"b/Esc  Return to the same draft",
		];
	}
	if (controller.view === "review") {
		return [
			header,
			...oversized,
			"Final review",
			...controller.draftAnswers.map(
				(answer, index) =>
					`${index + 1}. ${answer.questionId}: ${answer.value} (${answer.recommendation})`,
			),
			"Enter  Submit whole round atomically • b/Esc  Return",
		];
	}
	const question = input.questions[controller.questionIndex];
	if (question === undefined) throw new Error("Validated round has no current question");
	if (controller.view === "freeform") {
		return [
			header,
			...oversized,
			question.question,
			"Freeform answer:",
			...editor.render(editorWidth),
			"Esc  Return",
		];
	}
	return [
		header,
		...oversized,
		question.question,
		...(question.context === undefined ? [] : [question.context]),
		...question.options.flatMap((option, index) => {
			const selected =
				controller.currentAnswer?.kind === "option" &&
				controller.currentAnswer.value === option.value;
			const recommended = option.value === question.recommendedOptionValue;
			const optionLine = `${index + 1}. ${selected ? "●" : "○"} ${option.label}${recommended ? " ★ recommended" : ""}`;
			return option.description === undefined
				? [optionLine]
				: [optionLine, `   ${option.description}`];
		}),
		`Why: ${question.recommendationRationale}`,
		"←→/h/l navigate • 1–5 choose • f freeform • s status • v review • e end • Esc cancel",
	];
}

function editorTheme(value: unknown): unknown {
	const fg = themeForeground(value);
	return {
		borderColor: (text: string) => fg("accent", text),
		selectList: {
			selectedPrefix: (text: string) => fg("accent", text),
			selectedText: (text: string) => fg("accent", text),
			description: (text: string) => fg("muted", text),
			scrollInfo: (text: string) => fg("dim", text),
			noMatch: (text: string) => fg("warning", text),
		},
	};
}

function themeForeground(value: unknown): (color: string, text: string) => string {
	if (!isRecord(value) || typeof value.fg !== "function") {
		return (_color, text) => text;
	}
	const fg = value.fg;
	return (color, text) => fg.call(value, color, text) as string;
}

function matches(
	runtime: GrillRoundInlineRuntime,
	data: string,
	keyName: "left" | "right" | "enter" | "escape",
): boolean {
	const key = runtime.Key?.[keyName] ?? keyName;
	if (runtime.matchesKey(data, key)) return true;
	return keyName === "enter" && runtime.matchesKey(data, "return");
}

function missingRuntimeError(): Error {
	return new Error("Pi TUI runtime does not provide the components required by grill_ask_round");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
