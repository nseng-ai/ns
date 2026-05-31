import type { GrillAskToolContext, NormalizedGrillAskInput } from "../grill-ui.ts";
import { GrillAskController, type GrillAskOutcome } from "./controller.ts";
import { renderGrillAskOverlay, type GrillAskRenderPrimitives, type GrillAskRenderTheme } from "./render.ts";

export type GrillAskOverlayComponent = {
	focused?: boolean;
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	dispose?(): void;
};

type EditorLike = {
	focused?: boolean;
	onSubmit?: (value: string) => void;
	setText(value: string): void;
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate?(): void;
};

type EditorConstructor = new (tui: unknown, theme: unknown) => EditorLike;

export type GrillAskOverlayRuntime = {
	Editor: EditorConstructor;
	Key?: Record<string, string>;
	matchesKey(data: string, key: string): boolean;
	truncateToWidth(value: string, width: number, ellipsis?: string): string;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
	Markdown?: new (text: string, paddingX: number, paddingY: number, theme: unknown) => { render(width: number): string[] };
	markdownTheme?: unknown;
};

export async function runGrillAskOverlay(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
): Promise<GrillAskOutcome | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return undefined;
	const runtime = await loadGrillAskOverlayRuntime();
	return ctx.ui.custom<GrillAskOutcome>(
		(tui, theme, _keybindings, done) => createGrillAskOverlayComponent(input, runtime, tui, theme as GrillAskRenderTheme, done),
		{
			overlay: true,
			overlayOptions: {
				width: "82%",
				minWidth: 54,
				maxHeight: "85%",
				anchor: "center",
				margin: 1,
			},
		},
	);
}

export function createGrillAskOverlayComponent(
	input: NormalizedGrillAskInput,
	runtime: GrillAskOverlayRuntime,
	tui: unknown,
	theme: GrillAskRenderTheme,
	done: (outcome: GrillAskOutcome) => void,
): GrillAskOverlayComponent {
	return new GrillAskOverlay(input, runtime, tui, theme, done);
}

class GrillAskOverlay implements GrillAskOverlayComponent {
	private readonly controller: GrillAskController;
	private readonly editor: EditorLike;
	private focusedValue = false;

	constructor(
		private readonly input: NormalizedGrillAskInput,
		private readonly runtime: GrillAskOverlayRuntime,
		private readonly tui: unknown,
		private readonly theme: GrillAskRenderTheme,
		private readonly done: (outcome: GrillAskOutcome) => void,
	) {
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

		if (matches(this.runtime, data, "up")) {
			this.controller.moveFocus(-1);
			this.requestRender();
			return;
		}
		if (matches(this.runtime, data, "down")) {
			this.controller.moveFocus(1);
			this.requestRender();
			return;
		}
		if (matches(this.runtime, data, "enter")) {
			const outcome = this.controller.submitFocused();
			if (outcome === undefined) {
				this.editor.setText("");
				this.requestRender();
				return;
			}
			this.done(outcome);
			return;
		}
		if (matches(this.runtime, data, "escape")) {
			this.done({ action: "cancelled" });
		}
	}

	render(width: number): string[] {
		const editorWidth = Math.max(1, width - 2);
		const primitives = renderPrimitives(this.runtime);
		return renderGrillAskOverlay(
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

	dispose(): void {}

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

function renderPrimitives(runtime: GrillAskOverlayRuntime): GrillAskRenderPrimitives {
	return {
		truncateToWidth: runtime.truncateToWidth,
		...(runtime.wrapTextWithAnsi === undefined ? {} : { wrapTextWithAnsi: runtime.wrapTextWithAnsi }),
		...(runtime.visibleWidth === undefined ? {} : { visibleWidth: runtime.visibleWidth }),
		...(runtime.Markdown === undefined || runtime.markdownTheme === undefined
			? {}
			: {
					renderMarkdown: (markdown: string, width: number) =>
						new runtime.Markdown!(markdown, 0, 0, runtime.markdownTheme).render(width),
				}),
	};
}

function matches(runtime: GrillAskOverlayRuntime, data: string, keyName: "up" | "down" | "enter" | "escape"): boolean {
	const key = runtime.Key?.[keyName] ?? keyName;
	if (runtime.matchesKey(data, key)) return true;
	if (keyName === "enter") return runtime.matchesKey(data, "return");
	return false;
}

async function loadGrillAskOverlayRuntime(): Promise<GrillAskOverlayRuntime> {
	const tuiModule = (await import("@earendil-works/pi-tui")) as Partial<GrillAskOverlayRuntime>;
	const markdownTheme = await loadMarkdownTheme();
	if (tuiModule.Editor === undefined || tuiModule.matchesKey === undefined || tuiModule.truncateToWidth === undefined) {
		throw new Error("Pi TUI runtime does not provide the components required by grill_ask overlay");
	}
	return {
		Editor: tuiModule.Editor,
		...(tuiModule.Key === undefined ? {} : { Key: tuiModule.Key }),
		matchesKey: tuiModule.matchesKey,
		truncateToWidth: tuiModule.truncateToWidth,
		...(tuiModule.wrapTextWithAnsi === undefined ? {} : { wrapTextWithAnsi: tuiModule.wrapTextWithAnsi }),
		...(tuiModule.visibleWidth === undefined ? {} : { visibleWidth: tuiModule.visibleWidth }),
		...(tuiModule.Markdown === undefined ? {} : { Markdown: tuiModule.Markdown }),
		...(markdownTheme === undefined ? {} : { markdownTheme }),
	};
}

async function loadMarkdownTheme(): Promise<unknown | undefined> {
	try {
		const codingAgent = (await import("@earendil-works/pi-coding-agent")) as {
			getMarkdownTheme?: () => unknown;
		};
		return codingAgent.getMarkdownTheme?.();
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
