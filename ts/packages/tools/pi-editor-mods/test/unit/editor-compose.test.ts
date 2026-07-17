import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { EditorComponent, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

import {
	composeEditorComponent,
	withEditorInput,
	type EditorFactory,
} from "../../src/editor-compose.ts";

function fakeTui(): TUI {
	return Object.create(null) as TUI;
}

function fakeTheme(): EditorTheme {
	return Object.create(null) as EditorTheme;
}

function fakeKeybindings(): Parameters<EditorFactory>[2] {
	return Object.create(null) as Parameters<EditorFactory>[2];
}

function createEditor(inputLog: string[]): EditorComponent {
	return {
		onSubmit: vi.fn(),
		onChange: vi.fn(),
		borderColor: (text) => `border:${text}`,
		wantsKeyRelease: true,
		render: (width) => [`width:${width}`],
		invalidate: vi.fn(),
		getText: () => "text",
		setText: vi.fn(),
		handleInput: (data) => inputLog.push(data),
		addToHistory: vi.fn(),
		insertTextAtCursor: vi.fn(),
		getExpandedText: () => "expanded",
		setAutocompleteProvider: vi.fn(),
		setPaddingX: vi.fn(),
		setAutocompleteMaxVisible: vi.fn(),
	};
}

function createEditorUi(initialFactory: EditorFactory | undefined): {
	ui: Pick<ExtensionUIContext, "getEditorComponent" | "setEditorComponent">;
	getFactory(): EditorFactory | undefined;
} {
	let factory = initialFactory;
	return {
		ui: {
			getEditorComponent: () => factory,
			setEditorComponent: (nextFactory) => {
				factory = nextFactory;
			},
		},
		getFactory: () => factory,
	};
}

describe("composeEditorComponent", () => {
	it("captures and decorates the current factory in registration order", () => {
		const inputLog: string[] = [];
		const editor = createEditor(inputLog);
		const harness = createEditorUi(() => editor);

		composeEditorComponent(harness.ui, (current) =>
			withEditorInput(current, (data, delegate) => delegate(`first:${data}`)),
		);
		composeEditorComponent(harness.ui, (current) =>
			withEditorInput(current, (data, delegate) => delegate(`second:${data}`)),
		);

		const factory = harness.getFactory();
		expect(factory).toBeDefined();
		factory?.(fakeTui(), fakeTheme(), fakeKeybindings()).handleInput("input");
		expect(inputLog).toEqual(["first:second:input"]);
	});
});

describe("withEditorInput", () => {
	it("supports private-field accessors and stable method bindings", () => {
		class ClassEditor {
			#text = "private";

			get value(): string {
				return this.#text;
			}

			set value(next: string) {
				this.#text = next;
			}

			render(): string[] {
				return [this.#text];
			}

			invalidate(): void {}

			getText(): string {
				return this.#text;
			}

			setText(next: string): void {
				this.#text = next;
			}

			handleInput(data: string): void {
				this.#text += data;
			}
		}

		const editor = new ClassEditor();
		const decorated = withEditorInput(editor, (data, delegate) =>
			delegate(data),
		) as EditorComponent & {
			value: string;
		};
		expect(decorated.value).toBe("private");
		decorated.value = "changed";
		expect(decorated.value).toBe("changed");
		expect(decorated.render).toBe(decorated.render);
		editor.render = function replacement(): string[] {
			return ["replacement"];
		};
		expect(decorated.render).not.toBe(editor.render);
		expect(decorated.render(8)).toEqual(["replacement"]);
	});

	it("preserves callbacks, properties, and all optional editor methods", () => {
		const inputLog: string[] = [];
		const editor = createEditor(inputLog);
		const decorated = withEditorInput(editor, (data, delegate) => delegate(data));

		decorated.onSubmit?.("submit");
		decorated.onChange?.("change");
		decorated.addToHistory?.("history");
		decorated.insertTextAtCursor?.("insert");
		decorated.setPaddingX?.(2);
		decorated.setAutocompleteMaxVisible?.(4);

		expect(decorated.onSubmit).toBe(editor.onSubmit);
		expect(decorated.onChange).toBe(editor.onChange);
		expect(decorated.borderColor?.("x")).toBe("border:x");
		expect(decorated.wantsKeyRelease).toBe(true);
		expect(decorated.render(8)).toEqual(["width:8"]);
		expect(decorated.getText()).toBe("text");
		expect(decorated.getExpandedText?.()).toBe("expanded");
		expect(editor.addToHistory).toHaveBeenCalledWith("history");
		expect(editor.insertTextAtCursor).toHaveBeenCalledWith("insert");
		expect(editor.setPaddingX).toHaveBeenCalledWith(2);
		expect(editor.setAutocompleteMaxVisible).toHaveBeenCalledWith(4);
	});
});
