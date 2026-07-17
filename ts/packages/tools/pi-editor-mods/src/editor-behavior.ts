import type { EditorComponent } from "@earendil-works/pi-tui";
import { withEditorInput, type EditorDecorator } from "./editor-compose.ts";

import { replaceImageReferences, resolveImageReferences } from "./image-references.ts";
import type { ImageFileGateway } from "./image-files.ts";
import type { MarkerJournal } from "./marker-journal.ts";

const PASTE_START = "\u001b[200~";
const PASTE_END = "\u001b[201~";

interface CursorEditor {
	getCursor(): { line: number; col: number };
}

export function createScreenshotEditorDecorator(options: {
	journal: MarkerJournal;
	files: ImageFileGateway;
	home?: string;
}): EditorDecorator {
	return (editor) => {
		let pasteBuffer: string | undefined;
		return withEditorInput(editor, (data, delegate) => {
			const completePaste = collectPaste(data, pasteBuffer);
			pasteBuffer = completePaste.nextBuffer;
			if (completePaste.type === "buffering") return;
			if (completePaste.type === "complete") {
				const compacted = compactText(completePaste.payload, options);
				delegate(PASTE_START + compacted + PASTE_END + completePaste.remaining);
				return;
			}

			if (!hasCursor(editor)) {
				// Arbitrary EditorComponent implementations do not expose cursor placement.
				// Submission transport still resolves raw paths without risking cursor corruption.
				delegate(data);
				return;
			}
			delegate(data);
			const after = editor.getText();
			const compacted = compactText(after, options);
			if (compacted === after) return;
			const cursor = editor.getCursor();
			const cursorOffset = lineColumnToOffset(after, cursor);
			const compactedPrefix = compactText(after.slice(0, cursorOffset), options);
			editor.setText(compacted);
			restoreCursorByInput(editor, compactedPrefix.length);
		});
	};
}

export function compactText(
	text: string,
	options: { journal: MarkerJournal; files: ImageFileGateway; home?: string },
): string {
	const references = resolveImageReferences(text, {
		cwd: "/",
		...(options.home === undefined ? {} : { home: options.home }),
		validation: options.files,
	});
	return replaceImageReferences(text, references, (reference) =>
		options.journal.markerTextForPath(reference.path),
	);
}

function collectPaste(
	data: string,
	buffer: string | undefined,
):
	| { type: "none"; nextBuffer: undefined }
	| { type: "buffering"; nextBuffer: string }
	| { type: "complete"; payload: string; remaining: string; nextBuffer: undefined } {
	const startIndex = buffer === undefined ? data.indexOf(PASTE_START) : -1;
	if (buffer === undefined && startIndex < 0) return { type: "none", nextBuffer: undefined };
	const accumulated =
		buffer === undefined ? data.slice(startIndex + PASTE_START.length) : buffer + data;
	const endIndex = accumulated.indexOf(PASTE_END);
	if (endIndex < 0) return { type: "buffering", nextBuffer: accumulated };
	return {
		type: "complete",
		payload: accumulated.slice(0, endIndex),
		remaining: accumulated.slice(endIndex + PASTE_END.length),
		nextBuffer: undefined,
	};
}

function hasCursor(editor: EditorComponent): editor is EditorComponent & CursorEditor {
	return "getCursor" in editor && typeof editor.getCursor === "function";
}

function lineColumnToOffset(text: string, cursor: { line: number; col: number }): number {
	const lines = text.split("\n");
	let offset = 0;
	for (let index = 0; index < cursor.line; index += 1) offset += (lines[index]?.length ?? 0) + 1;
	return offset + cursor.col;
}

function restoreCursorByInput(editor: EditorComponent, offset: number): void {
	if (offset >= editor.getText().length) return;
	editor.handleInput("\u001b[H");
	const prefix = editor.getText().slice(0, offset);
	const lines = prefix.split("\n");
	const line = lines.length - 1;
	const column = lines.at(-1)?.length ?? 0;
	if (line > 0) editor.handleInput("\u001b[B".repeat(line));
	if (column > 0) editor.handleInput("\u001b[C".repeat(column));
}
