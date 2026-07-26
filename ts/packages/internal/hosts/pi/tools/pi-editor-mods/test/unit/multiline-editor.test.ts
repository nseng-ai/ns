import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { EditorComponent, EditorTheme, TUI } from "@earendil-works/pi-tui";
import {
	composeEditorComponent,
	withEditorInput,
	type EditorDecorator,
	type EditorFactory,
} from "../../src/editor-compose.ts";
import { describe, expect, it } from "vitest";

import { createMultilineEditorDecorator, matchesMultilineKey } from "../../src/multiline-editor.ts";

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
		render: () => [],
		invalidate: () => undefined,
		getText: () => "",
		setText: () => undefined,
		handleInput: (data) => inputLog.push(data),
	};
}

function createEditorUi(editor: EditorComponent): {
	ui: Pick<ExtensionUIContext, "getEditorComponent" | "setEditorComponent">;
	getFactory(): EditorFactory;
} {
	let factory: EditorFactory = () => editor;
	return {
		ui: {
			getEditorComponent: () => factory,
			setEditorComponent: (nextFactory) => {
				if (nextFactory === undefined) {
					throw new Error("Test editor factory cannot be cleared");
				}
				factory = nextFactory;
			},
		},
		getFactory: () => factory,
	};
}

function syntheticDecorator(trace: string[]): EditorDecorator {
	return (editor) =>
		withEditorInput(editor, (data, delegate) => {
			trace.push(data);
			delegate(data);
		});
}

function instantiate(factory: EditorFactory): EditorComponent {
	return factory(fakeTui(), fakeTheme(), fakeKeybindings());
}

describe("multiline editor input", () => {
	it("matches Pi's Shift+Enter and Alt+Enter key encodings", () => {
		expect(matchesMultilineKey("\u001b[13;2u")).toBe(true);
		expect(matchesMultilineKey("\u001b\r")).toBe(true);
		expect(matchesMultilineKey("\r")).toBe(false);
	});

	it("delegates multiline keys as one literal newline and other input unchanged", () => {
		const inputLog: string[] = [];
		const editor = createMultilineEditorDecorator((data) => data === "multiline")(
			createEditor(inputLog),
		);

		editor.handleInput("multiline");
		editor.handleInput("ordinary");

		expect(inputLog).toEqual(["\n", "ordinary"]);
	});

	it("delegates exactly once when multiline is inside another decorator", () => {
		const inputLog: string[] = [];
		const syntheticTrace: string[] = [];
		const harness = createEditorUi(createEditor(inputLog));

		composeEditorComponent(
			harness.ui,
			createMultilineEditorDecorator((data) => data === "multiline"),
		);
		composeEditorComponent(harness.ui, syntheticDecorator(syntheticTrace));
		instantiate(harness.getFactory()).handleInput("multiline");

		expect(syntheticTrace).toEqual(["multiline"]);
		expect(inputLog).toEqual(["\n"]);
	});

	it("delegates exactly once when multiline is outside another decorator", () => {
		const inputLog: string[] = [];
		const syntheticTrace: string[] = [];
		const harness = createEditorUi(createEditor(inputLog));

		composeEditorComponent(harness.ui, syntheticDecorator(syntheticTrace));
		composeEditorComponent(
			harness.ui,
			createMultilineEditorDecorator((data) => data === "multiline"),
		);
		instantiate(harness.getFactory()).handleInput("multiline");

		expect(syntheticTrace).toEqual(["\n"]);
		expect(inputLog).toEqual(["\n"]);
	});
});
