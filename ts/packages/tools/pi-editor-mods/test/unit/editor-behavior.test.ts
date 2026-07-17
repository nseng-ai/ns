import type { EditorComponent } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { createMultilineEditorDecorator } from "../../src/multiline-editor.ts";

import { createScreenshotEditorDecorator } from "../../src/editor-behavior.ts";
import type { ImageFileGateway } from "../../src/image-files.ts";
import { MarkerJournal, restoreMarkerJournal } from "../../src/marker-journal.ts";

const files: ImageFileGateway = {
	isSupportedImage: (path) => path === "/shot.png",
	readImage: async () => undefined,
};

function journal(): MarkerJournal {
	return new MarkerJournal({ appendEntry: () => undefined }, restoreMarkerJournal([]));
}

function editorWithCursor(
	initial = "",
): EditorComponent & { getCursor(): { line: number; col: number } } {
	let text = initial;
	let cursor = initial.length;
	return {
		render: () => [],
		invalidate: () => undefined,
		getText: () => text,
		getCursor: () => {
			const prefix = text.slice(0, cursor);
			const lines = prefix.split("\n");
			return { line: lines.length - 1, col: lines.at(-1)?.length ?? 0 };
		},
		getExpandedText: () => text,
		setText: (next) => {
			text = next;
			cursor = next.length;
		},
		handleInput: (data) => {
			if (data === "\u001b[H") {
				cursor = 0;
				return;
			}
			if (/^(?:\u001b\[B)+$/.test(data)) {
				cursor = text.indexOf("\n", cursor) + 1;
				return;
			}
			if (/^(?:\u001b\[C)+$/.test(data)) {
				cursor += data.length / 3;
				return;
			}
			if (data.startsWith("\u001b[200~")) {
				const payload = data.slice(6, data.indexOf("\u001b[201~"));
				text = text.slice(0, cursor) + payload + text.slice(cursor);
				cursor += payload.length;
				return;
			}
			text = text.slice(0, cursor) + data + text.slice(cursor);
			cursor += data.length;
		},
	};
}

describe("editor behavior", () => {
	it("compacts a complete bracketed paste before delegating and preserves expanded text contract", () => {
		const editor = editorWithCursor();
		const decorated = createScreenshotEditorDecorator({ journal: journal(), files })(editor);
		decorated.handleInput("\u001b[200~/shot.png\u001b[201~");
		expect(decorated.getText()).toBe("[screenshot #1]");
		expect(decorated.getExpandedText?.()).toBe("[screenshot #1]");
	});

	it("buffers split bracketed paste until complete", () => {
		const editor = editorWithCursor();
		const decorated = createScreenshotEditorDecorator({ journal: journal(), files })(editor);
		decorated.handleInput("\u001b[200~/shot");
		expect(decorated.getText()).toBe("");
		decorated.handleInput(".png\u001b[201~");
		expect(decorated.getText()).toBe("[screenshot #1]");
	});

	it("preserves a middle cursor while compacting ordinary typing", () => {
		const editor = editorWithCursor("/shot.pn suffix");
		editor.handleInput("\u001b[H");
		editor.handleInput("\u001b[C".repeat(8));
		const decorated = createScreenshotEditorDecorator({ journal: journal(), files })(editor);
		decorated.handleInput("g");
		expect(decorated.getText()).toBe("[screenshot #1] suffix");
		expect(editor.getCursor()).toEqual({ line: 0, col: 15 });
	});

	it("preserves a cursor on a later line while compacting ordinary typing", () => {
		const editor = editorWithCursor("first\n/shot.pn suffix");
		editor.handleInput("\u001b[H");
		editor.handleInput("\u001b[B");
		editor.handleInput("\u001b[C".repeat(8));
		const decorated = createScreenshotEditorDecorator({ journal: journal(), files })(editor);
		decorated.handleInput("g");
		expect(decorated.getText()).toBe("first\n[screenshot #1] suffix");
		expect(editor.getCursor()).toEqual({ line: 1, col: 15 });
	});

	it("defers ordinary compaction without cursor API instead of moving cursor", () => {
		let text = "/shot.pn";
		const editor: EditorComponent = {
			render: () => [],
			invalidate: () => undefined,
			getText: () => text,
			setText: (next) => {
				text = next;
			},
			handleInput: (data) => {
				text += data;
			},
		};
		createScreenshotEditorDecorator({ journal: journal(), files })(editor).handleInput("g");
		expect(text).toBe("/shot.png");
	});

	it.each(["multiline-inside", "screenshots-inside"])(
		"composes with multiline in either decorator order: %s",
		(order) => {
			const base = editorWithCursor();
			const screenshots = createScreenshotEditorDecorator({ journal: journal(), files });
			const multiline = createMultilineEditorDecorator((data) => data === "multiline");
			const decorated =
				order === "multiline-inside" ? screenshots(multiline(base)) : multiline(screenshots(base));
			decorated.handleInput("multiline");
			decorated.handleInput("\u001b[200~/shot.png\u001b[201~");
			expect(decorated.getText()).toBe("\n[screenshot #1]");
		},
	);
});
