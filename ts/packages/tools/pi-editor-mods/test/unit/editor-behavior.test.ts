import type { EditorComponent } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { createMultilineEditorDecorator } from "../../src/multiline-editor.ts";

import { createScreenshotEditorDecorator } from "../../src/editor-behavior.ts";
import type { ImageFileGateway } from "../../src/image-files.ts";
import { MarkerJournal, restoreMarkerJournal } from "../../src/marker-journal.ts";

function journal(): MarkerJournal {
	return new MarkerJournal({ appendEntry: () => undefined }, restoreMarkerJournal([]));
}

function editorHarness(): { editor: EditorComponent; inputs: string[] } {
	const inputs: string[] = [];
	return {
		inputs,
		editor: {
			render: () => [],
			invalidate: () => undefined,
			getText: () => {
				throw new Error("input decorator must not read editor text");
			},
			setText: () => {
				throw new Error("input decorator must not replace editor text");
			},
			handleInput: (data) => inputs.push(data),
		},
	};
}

describe("editor behavior", () => {
	it("compacts a supported path in an exact complete bracketed paste", () => {
		const harness = editorHarness();
		const files: ImageFileGateway = {
			isSupportedImage: (path) => path === "/shot.png",
			readImage: async () => undefined,
		};
		const decorated = createScreenshotEditorDecorator({ journal: journal(), files })(
			harness.editor,
		);
		decorated.handleInput("\u001b[200~/shot.png /missing.png\u001b[201~");
		expect(harness.inputs).toEqual(["\u001b[200~[screenshot #1] /missing.png\u001b[201~"]);
	});

	it.each([
		"g",
		"\u001b[200~/shot",
		"prefix\u001b[200~/shot.png\u001b[201~",
		"\u001b[200~/shot.png\u001b[201~suffix",
		"\u001b[200~outer\u001b[200~/shot.png\u001b[201~",
	])("delegates non-exact input unchanged without filesystem validation: %j", (input) => {
		const harness = editorHarness();
		let validations = 0;
		const files: ImageFileGateway = {
			isSupportedImage: () => {
				validations += 1;
				return true;
			},
			readImage: async () => undefined,
		};
		createScreenshotEditorDecorator({ journal: journal(), files })(harness.editor).handleInput(
			input,
		);
		expect(harness.inputs).toEqual([input]);
		expect(validations).toBe(0);
	});

	it.each(["multiline-inside", "screenshots-inside"])(
		"composes with multiline in either decorator order: %s",
		(order) => {
			const harness = editorHarness();
			const files: ImageFileGateway = {
				isSupportedImage: (path) => path === "/shot.png",
				readImage: async () => undefined,
			};
			const screenshots = createScreenshotEditorDecorator({ journal: journal(), files });
			const multiline = createMultilineEditorDecorator((data) => data === "multiline");
			const decorated =
				order === "multiline-inside"
					? screenshots(multiline(harness.editor))
					: multiline(screenshots(harness.editor));
			decorated.handleInput("multiline");
			decorated.handleInput("\u001b[200~/shot.png\u001b[201~");
			expect(harness.inputs).toEqual(["\n", "\u001b[200~[screenshot #1]\u001b[201~"]);
		},
	);
});
