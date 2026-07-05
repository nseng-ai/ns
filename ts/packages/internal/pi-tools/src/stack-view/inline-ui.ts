/**
 * The interactive inline UI for the `/stack:view` panel. Mirrors the grill inline
 * UI idioms: the Pi TUI runtime is lazily imported from `@earendil-works/pi-tui`,
 * the theme value handed to the `ctx.ui.custom` factory is duck-typed into a
 * narrow render theme, re-renders go through a duck-typed `tui.requestRender()`,
 * and the returned component implements the `{ render, handleInput, invalidate }`
 * shape the host expects. This module deliberately does NOT import from `grill`:
 * the small runtime-adapter shape is duplicated here to keep the subpackages
 * decoupled.
 *
 * The component is pure presentation over an immutable {@link StackViewModel}:
 * it never performs I/O. Every terminal side effect (open a URL, summarize,
 * refresh, close) is expressed as a settled {@link StackViewUiOutcome} the
 * extension host acts on. Selection indexes `model.prs` only (the trunk row is
 * never focusable) and the final selection is returned alongside the outcome so
 * the host can re-open the panel preserving the user's place after an open or
 * refresh.
 */
import type { StackViewModel } from "./types.ts";
import {
	renderStackView,
	type StackViewRenderPrimitives,
	type StackViewRenderTheme,
} from "./render.ts";

/** What the user asked the host to do when the inline panel settled. */
export type StackViewUiOutcome =
	| { action: "open"; url: string }
	| { action: "summarize" }
	| { action: "refresh" }
	| { action: "close" };

/** The settled result of one inline-panel session: the outcome plus the final selection. */
export interface StackViewUiResult {
	outcome: StackViewUiOutcome;
	selectedIndex: number;
}

/** Options for {@link runStackViewInlineUi}; `selectedIndex` seeds the initial selection. */
export interface StackViewInlineUiOptions {
	selectedIndex?: number;
}

/** The component shape the host `ctx.ui.custom` factory must return. */
export interface StackViewCustomComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	dispose?(): void;
}

/**
 * The narrow slice of the Pi command context the inline UI needs: the UI gate
 * plus the `custom` renderer factory. Structurally satisfied by the extension's
 * `CommandContext`.
 */
export interface StackViewInlineUiContext {
	hasUI: boolean;
	ui: {
		custom?<T>(
			factory: (
				tui: unknown,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => StackViewCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
}

/** The lazily-loaded slice of the Pi TUI runtime the inline UI depends on. */
export interface StackViewInlineRuntime {
	matchesKey(data: string, key: string): boolean;
	truncateToWidth(value: string, width: number, ellipsis?: string): string;
	Key?: Record<string, string>;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
}

/**
 * Run the interactive stack-view panel. Returns `undefined` when the host has no
 * interactive UI (`!ctx.hasUI` or `ctx.ui.custom === undefined`) so the caller
 * can fall back to a plain snapshot; otherwise resolves once the user settles the
 * panel, carrying the outcome and the final selection.
 */
export async function runStackViewInlineUi(
	model: StackViewModel,
	ctx: StackViewInlineUiContext,
	options: StackViewInlineUiOptions = {},
): Promise<StackViewUiResult | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return undefined;
	const runtime = await loadStackViewInlineRuntime();
	return runStackViewInlineUiWithRuntime(model, ctx, runtime, options);
}

/**
 * Runtime-injected variant of {@link runStackViewInlineUi}. Kept separate so
 * tests can drive the component with a fake runtime instead of loading the real
 * Pi TUI module.
 */
export function runStackViewInlineUiWithRuntime(
	model: StackViewModel,
	ctx: StackViewInlineUiContext,
	runtime: StackViewInlineRuntime,
	options: StackViewInlineUiOptions = {},
): Promise<StackViewUiResult | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return Promise.resolve(undefined);
	const initialIndex = resolveInitialIndex(model, options.selectedIndex);
	return ctx.ui.custom<StackViewUiResult>((tui, theme, _keybindings, done) =>
		createStackViewInlineComponent({
			model,
			runtime,
			tui,
			theme: stackViewRenderThemeFromValue(theme),
			done,
			initialIndex,
		}),
	);
}

interface CreateStackViewInlineComponentParams {
	model: StackViewModel;
	runtime: StackViewInlineRuntime;
	tui: unknown;
	theme: StackViewRenderTheme;
	done: (result: StackViewUiResult) => void;
	initialIndex: number;
}

/** Build the inline component. Exported so tests can construct it with a fake runtime/theme. */
export function createStackViewInlineComponent(
	params: CreateStackViewInlineComponentParams,
): StackViewCustomComponent {
	return new StackViewInlineUi(params);
}

/** Duck-type the host theme value into the narrow render theme, binding each method to its owner. */
export function stackViewRenderThemeFromValue(value: unknown): StackViewRenderTheme {
	if (!isRecord(value)) return {};

	const theme: StackViewRenderTheme = {};
	const fg = value.fg;
	const bg = value.bg;
	const bold = value.bold;
	if (isThemeColorFunction(fg)) theme.fg = (color, text) => fg.call(value, color, text);
	if (isThemeColorFunction(bg)) theme.bg = (color, text) => bg.call(value, color, text);
	if (isThemeTextFunction(bold)) theme.bold = (text) => bold.call(value, text);
	return theme;
}

/** Build a {@link StackViewInlineRuntime} from the imported Pi TUI module value, validating shape. */
export function stackViewInlineRuntimeFromModule(moduleValue: unknown): StackViewInlineRuntime {
	if (!isRecord(moduleValue)) throw missingInlineRuntimeError();

	const matchesKey = moduleValue.matchesKey;
	const truncateToWidth = moduleValue.truncateToWidth;
	if (!isMatchesKeyFunction(matchesKey) || !isTruncateToWidthFunction(truncateToWidth)) {
		throw missingInlineRuntimeError();
	}

	const runtime: StackViewInlineRuntime = { matchesKey, truncateToWidth };
	const Key = keyMapFromValue(moduleValue.Key);
	if (Key !== undefined) runtime.Key = Key;
	if (isWrapTextWithAnsiFunction(moduleValue.wrapTextWithAnsi))
		runtime.wrapTextWithAnsi = moduleValue.wrapTextWithAnsi;
	if (isVisibleWidthFunction(moduleValue.visibleWidth))
		runtime.visibleWidth = moduleValue.visibleWidth;
	return runtime;
}

class StackViewInlineUi implements StackViewCustomComponent {
	private readonly model: StackViewModel;
	private readonly runtime: StackViewInlineRuntime;
	private readonly tui: unknown;
	private readonly theme: StackViewRenderTheme;
	private readonly done: (result: StackViewUiResult) => void;
	private selectedIndex: number;

	constructor(params: CreateStackViewInlineComponentParams) {
		this.model = params.model;
		this.runtime = params.runtime;
		this.tui = params.tui;
		this.theme = params.theme;
		this.done = params.done;
		this.selectedIndex = params.initialIndex;
	}

	render(width: number): string[] {
		return renderStackView({
			model: this.model,
			selectedIndex: this.selectedIndex,
			width,
			theme: this.theme,
			primitives: renderPrimitives(this.runtime),
		});
	}

	handleInput(data: string): void {
		if (matches(this.runtime, data, "up") || data === "k") {
			this.moveSelection(-1);
			return;
		}
		if (matches(this.runtime, data, "down") || data === "j") {
			this.moveSelection(1);
			return;
		}
		if (matches(this.runtime, data, "enter") || data === "o") {
			this.settleOpen();
			return;
		}
		if (data === "s") {
			this.settle({ action: "summarize" });
			return;
		}
		if (data === "r") {
			this.settle({ action: "refresh" });
			return;
		}
		if (matches(this.runtime, data, "escape") || data === "q") {
			this.settle({ action: "close" });
		}
	}

	invalidate(): void {}

	private moveSelection(delta: number): void {
		const count = this.model.prs.length;
		if (count === 0) return;
		this.selectedIndex = clamp(this.selectedIndex + delta, 0, count - 1);
		this.requestRender();
	}

	private settleOpen(): void {
		const selected = this.model.prs[this.selectedIndex];
		// A `no-pr` row (or any row without a Graphite URL) has nothing to open;
		// ignore the keypress rather than settling on an empty URL.
		if (selected === undefined || selected.graphiteUrl.length === 0) return;
		this.settle({ action: "open", url: selected.graphiteUrl });
	}

	private settle(outcome: StackViewUiOutcome): void {
		this.done({ outcome, selectedIndex: this.selectedIndex });
	}

	private requestRender(): void {
		if (isRecord(this.tui) && typeof this.tui.requestRender === "function") {
			this.tui.requestRender();
		}
	}
}

/**
 * Seed the initial selection: an explicit request wins (clamped), else the
 * current-branch row, else the top of the stack.
 */
function resolveInitialIndex(model: StackViewModel, requested: number | undefined): number {
	const count = model.prs.length;
	if (count === 0) return 0;
	if (requested !== undefined) return clamp(requested, 0, count - 1);
	const currentIndex = model.prs.findIndex((row) => row.branch === model.currentBranch);
	return currentIndex >= 0 ? currentIndex : 0;
}

function renderPrimitives(runtime: StackViewInlineRuntime): StackViewRenderPrimitives {
	return {
		truncateToWidth: runtime.truncateToWidth,
		...(runtime.wrapTextWithAnsi === undefined
			? {}
			: { wrapTextWithAnsi: runtime.wrapTextWithAnsi }),
		...(runtime.visibleWidth === undefined ? {} : { visibleWidth: runtime.visibleWidth }),
	};
}

function matches(
	runtime: StackViewInlineRuntime,
	data: string,
	keyName: "up" | "down" | "enter" | "escape",
): boolean {
	const key = runtime.Key?.[keyName] ?? keyName;
	if (runtime.matchesKey(data, key)) return true;
	if (keyName === "enter") return runtime.matchesKey(data, "return");
	return false;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

async function loadStackViewInlineRuntime(): Promise<StackViewInlineRuntime> {
	const tuiModule: unknown = await import("@earendil-works/pi-tui");
	return stackViewInlineRuntimeFromModule(tuiModule);
}

function missingInlineRuntimeError(): Error {
	return new Error(
		"Pi TUI runtime does not provide the components required by stack:view inline UI",
	);
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

function isMatchesKeyFunction(value: unknown): value is StackViewInlineRuntime["matchesKey"] {
	return typeof value === "function";
}

function isTruncateToWidthFunction(
	value: unknown,
): value is StackViewInlineRuntime["truncateToWidth"] {
	return typeof value === "function";
}

function isWrapTextWithAnsiFunction(
	value: unknown,
): value is NonNullable<StackViewInlineRuntime["wrapTextWithAnsi"]> {
	return typeof value === "function";
}

function isVisibleWidthFunction(
	value: unknown,
): value is NonNullable<StackViewInlineRuntime["visibleWidth"]> {
	return typeof value === "function";
}

function isThemeColorFunction(value: unknown): value is NonNullable<StackViewRenderTheme["fg"]> {
	return typeof value === "function";
}

function isThemeTextFunction(value: unknown): value is NonNullable<StackViewRenderTheme["bold"]> {
	return typeof value === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
