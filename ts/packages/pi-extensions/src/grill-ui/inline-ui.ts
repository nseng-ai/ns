import type { GrillAskCustomComponent, GrillAskToolContext, NormalizedGrillAskInput } from "../grill-ui.ts";
import { GrillAskController, type GrillAskOutcome } from "./controller.ts";
import { renderGrillAskInlineUi, type GrillAskRenderPrimitives, type GrillAskRenderTheme } from "./render.ts";

interface EditorLike {
	focused?: boolean;
	onSubmit?: (value: string) => void;
	setText(value: string): void;
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate?(): void;
}

type EditorConstructor = new (tui: unknown, theme: unknown) => EditorLike;

export interface GrillAskInlineRuntime {
	Editor: EditorConstructor;
	Key?: Record<string, string>;
	matchesKey(data: string, key: string): boolean;
	truncateToWidth(value: string, width: number, ellipsis?: string): string;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
	Markdown?: new (text: string, paddingX: number, paddingY: number, theme: unknown) => { render(width: number): string[] };
	markdownTheme?: unknown;
}

export async function runGrillAskInlineUi(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
): Promise<GrillAskOutcome | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return undefined;
	const runtime = await loadGrillAskInlineRuntime();
	return runGrillAskInlineUiWithRuntime(input, ctx, runtime);
}

export function runGrillAskInlineUiWithRuntime(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
	runtime: GrillAskInlineRuntime,
): Promise<GrillAskOutcome | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return Promise.resolve(undefined);
	return ctx.ui.custom<GrillAskOutcome>((tui, theme, _keybindings, done) =>
		createGrillAskInlineComponent(input, runtime, tui, grillAskRenderThemeFromValue(theme), done),
	);
}

export function createGrillAskInlineComponent(
	input: NormalizedGrillAskInput,
	runtime: GrillAskInlineRuntime,
	tui: unknown,
	theme: GrillAskRenderTheme,
	done: (outcome: GrillAskOutcome) => void,
): GrillAskCustomComponent {
	return new GrillAskInlineUi(input, runtime, tui, theme, done);
}

export function grillAskRenderThemeFromValue(value: unknown): GrillAskRenderTheme {
	if (!isRecord(value)) return {};

	const theme: GrillAskRenderTheme = {};
	if (isThemeColorFunction(value.fg)) theme.fg = value.fg;
	if (isThemeColorFunction(value.bg)) theme.bg = value.bg;
	if (isThemeTextFunction(value.bold)) theme.bold = value.bold;
	return theme;
}

export function grillAskInlineRuntimeFromModule(
	moduleValue: unknown,
	markdownTheme: unknown | undefined,
): GrillAskInlineRuntime {
	if (!isRecord(moduleValue)) {
		throw missingInlineRuntimeError();
	}

	const Editor = moduleValue.Editor;
	const matchesKey = moduleValue.matchesKey;
	const truncateToWidth = moduleValue.truncateToWidth;
	if (!isEditorConstructor(Editor) || !isMatchesKeyFunction(matchesKey) || !isTruncateToWidthFunction(truncateToWidth)) {
		throw missingInlineRuntimeError();
	}

	const runtime: GrillAskInlineRuntime = {
		Editor,
		matchesKey,
		truncateToWidth,
	};

	const Key = keyMapFromValue(moduleValue.Key);
	if (Key !== undefined) runtime.Key = Key;
	if (isWrapTextWithAnsiFunction(moduleValue.wrapTextWithAnsi)) runtime.wrapTextWithAnsi = moduleValue.wrapTextWithAnsi;
	if (isVisibleWidthFunction(moduleValue.visibleWidth)) runtime.visibleWidth = moduleValue.visibleWidth;
	if (isMarkdownConstructor(moduleValue.Markdown)) runtime.Markdown = moduleValue.Markdown;
	if (markdownTheme !== undefined) runtime.markdownTheme = markdownTheme;

	return runtime;
}

export function markdownThemeFromCodingAgentModule(value: unknown): unknown | undefined {
	if (!isRecord(value)) return undefined;
	const getMarkdownTheme = value.getMarkdownTheme;
	if (!isGetMarkdownThemeFunction(getMarkdownTheme)) return undefined;
	return getMarkdownTheme();
}

class GrillAskInlineUi implements GrillAskCustomComponent {
	private readonly input: NormalizedGrillAskInput;
	private readonly runtime: GrillAskInlineRuntime;
	private readonly tui: unknown;
	private readonly theme: GrillAskRenderTheme;
	private readonly done: (outcome: GrillAskOutcome) => void;
	private readonly controller: GrillAskController;
	private readonly editor: EditorLike;
	private focusedValue = false;

	constructor(
		input: NormalizedGrillAskInput,
		runtime: GrillAskInlineRuntime,
		tui: unknown,
		theme: GrillAskRenderTheme,
		done: (outcome: GrillAskOutcome) => void,
	) {
		this.input = input;
		this.runtime = runtime;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.controller = new GrillAskController(input);
		this.editor = new runtime.Editor(tui, editorTheme(theme));
		this.editor.onSubmit = (value) => {
			const outcome = this.controller.submitFreeform(value);
			if (outcome === undefined) {
				this.requestRender();
				return;
			}
			this.done(outcome);
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
		if (this.controller.mode === "freeform") {
			if (matches(this.runtime, data, "escape")) {
				this.controller.closeFreeform();
				this.editor.setText("");
				this.requestRender();
				return;
			}
			this.editor.handleInput(data);
			this.requestRender();
			return;
		}

		if (matches(this.runtime, data, "up") || data === "k") {
			this.controller.moveFocus(-1);
			this.requestRender();
			return;
		}
		if (matches(this.runtime, data, "down") || data === "j") {
			this.controller.moveFocus(1);
			this.requestRender();
			return;
		}
		const shortcutIndex = rowShortcutIndex(data);
		if (shortcutIndex !== undefined) {
			const targetIndex = this.controller.rows.findIndex((row) => row.index === shortcutIndex);
			if (targetIndex >= 0) {
				this.controller.setFocus(targetIndex);
				this.submitFocusedSelection();
			}
			return;
		}
		if (matches(this.runtime, data, "enter")) {
			this.submitFocusedSelection();
			return;
		}
		if (matches(this.runtime, data, "escape")) {
			this.done({ action: "cancelled" });
		}
	}

	render(width: number): string[] {
		const editorWidth = Math.max(1, width - 2);
		const primitives = renderPrimitives(this.runtime);
		return renderGrillAskInlineUi(
			this.input,
			{
				mode: this.controller.mode,
				rows: this.controller.rows,
				focusIndex: this.controller.focusIndex,
				editorLines: this.controller.mode === "freeform" ? this.editor.render(editorWidth) : [],
			},
			width,
			this.theme,
			primitives,
		);
	}

	invalidate(): void {
		this.editor.invalidate?.();
	}

	private submitFocusedSelection(): void {
		const outcome = this.controller.submitFocused();
		if (outcome === undefined) {
			this.editor.setText("");
			this.requestRender();
			return;
		}
		this.done(outcome);
	}

	private requestRender(): void {
		if (isRecord(this.tui) && typeof this.tui.requestRender === "function") {
			this.tui.requestRender();
		}
	}
}

function editorTheme(theme: GrillAskRenderTheme): unknown {
	return {
		borderColor: (value: string) => theme.fg?.("accent", value) ?? value,
		selectList: {
			selectedPrefix: (value: string) => theme.fg?.("accent", value) ?? value,
			selectedText: (value: string) => theme.fg?.("accent", value) ?? value,
			description: (value: string) => theme.fg?.("muted", value) ?? value,
			scrollInfo: (value: string) => theme.fg?.("dim", value) ?? value,
			noMatch: (value: string) => theme.fg?.("warning", value) ?? value,
		},
	};
}

function renderPrimitives(runtime: GrillAskInlineRuntime): GrillAskRenderPrimitives {
	const Markdown = runtime.Markdown;
	const markdownTheme = runtime.markdownTheme;
	return {
		truncateToWidth: runtime.truncateToWidth,
		...(runtime.wrapTextWithAnsi === undefined ? {} : { wrapTextWithAnsi: runtime.wrapTextWithAnsi }),
		...(runtime.visibleWidth === undefined ? {} : { visibleWidth: runtime.visibleWidth }),
		...(Markdown === undefined || markdownTheme === undefined
			? {}
			: {
					renderMarkdown: (markdown: string, width: number) => new Markdown(markdown, 0, 0, markdownTheme).render(width),
				}),
	};
}

function rowShortcutIndex(data: string): number | undefined {
	if (!/^[1-9]$/.test(data)) return undefined;
	return Number.parseInt(data, 10);
}

function matches(runtime: GrillAskInlineRuntime, data: string, keyName: "up" | "down" | "enter" | "escape"): boolean {
	const key = runtime.Key?.[keyName] ?? keyName;
	if (runtime.matchesKey(data, key)) return true;
	if (keyName === "enter") return runtime.matchesKey(data, "return");
	return false;
}

async function loadGrillAskInlineRuntime(): Promise<GrillAskInlineRuntime> {
	const tuiModule: unknown = await import("@earendil-works/pi-tui");
	const markdownTheme = await loadMarkdownTheme();
	return grillAskInlineRuntimeFromModule(tuiModule, markdownTheme);
}

async function loadMarkdownTheme(): Promise<unknown | undefined> {
	try {
		const codingAgent: unknown = await import("@earendil-works/pi-coding-agent");
		return markdownThemeFromCodingAgentModule(codingAgent);
	} catch {
		// Markdown support is optional; fall back to plain wrapping if the package or theme hook fails.
		return undefined;
	}
}

function missingInlineRuntimeError(): Error {
	return new Error("Pi TUI runtime does not provide the components required by grill_ask inline UI");
}

function keyMapFromValue(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const keyMap: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item !== "string") return undefined;
		keyMap[key] = item;
	}
	return keyMap;
}

function isEditorConstructor(value: unknown): value is EditorConstructor {
	return typeof value === "function";
}

function isMatchesKeyFunction(value: unknown): value is GrillAskInlineRuntime["matchesKey"] {
	return typeof value === "function";
}

function isTruncateToWidthFunction(value: unknown): value is GrillAskInlineRuntime["truncateToWidth"] {
	return typeof value === "function";
}

function isWrapTextWithAnsiFunction(value: unknown): value is NonNullable<GrillAskInlineRuntime["wrapTextWithAnsi"]> {
	return typeof value === "function";
}

function isVisibleWidthFunction(value: unknown): value is NonNullable<GrillAskInlineRuntime["visibleWidth"]> {
	return typeof value === "function";
}

function isMarkdownConstructor(value: unknown): value is NonNullable<GrillAskInlineRuntime["Markdown"]> {
	return typeof value === "function";
}

function isGetMarkdownThemeFunction(value: unknown): value is () => unknown {
	return typeof value === "function";
}

function isThemeColorFunction(value: unknown): value is NonNullable<GrillAskRenderTheme["fg"]> {
	return typeof value === "function";
}

function isThemeTextFunction(value: unknown): value is NonNullable<GrillAskRenderTheme["bold"]> {
	return typeof value === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
