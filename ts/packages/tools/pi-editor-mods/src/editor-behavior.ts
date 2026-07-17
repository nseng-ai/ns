import { withEditorInput, type EditorDecorator } from "./editor-compose.ts";

import { replaceImageReferences, resolveImageReferences } from "./image-references.ts";
import type { ImageFileGateway } from "./image-files.ts";
import type { MarkerJournal } from "./marker-journal.ts";

const PASTE_START = "\u001b[200~";
const PASTE_END = "\u001b[201~";

export function createScreenshotEditorDecorator(options: {
	journal: MarkerJournal;
	files: ImageFileGateway;
	home?: string;
}): EditorDecorator {
	return (editor) =>
		withEditorInput(editor, (data, delegate) => {
			if (!data.startsWith(PASTE_START) || !data.endsWith(PASTE_END)) {
				delegate(data);
				return;
			}
			const payload = data.slice(PASTE_START.length, -PASTE_END.length);
			if (payload.includes(PASTE_START) || payload.includes(PASTE_END)) {
				delegate(data);
				return;
			}
			delegate(PASTE_START + compactText(payload, options) + PASTE_END);
		});
}

export function compactText(
	text: string,
	options: { journal: MarkerJournal; files: ImageFileGateway; home?: string },
): string {
	const references = resolveImageReferences(text, options).filter((reference) =>
		options.files.isSupportedImage(reference.path),
	);
	return replaceImageReferences(text, references, (reference) =>
		options.journal.markerTextForPath(reference.path),
	);
}
