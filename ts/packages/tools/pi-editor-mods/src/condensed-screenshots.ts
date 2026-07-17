import type { ImageContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import { composeEditorComponent } from "./editor-compose.ts";

import { createScreenshotEditorDecorator } from "./editor-behavior.ts";
import { createNodeImageFileGateway, type ImageFileGateway } from "./image-files.ts";
import {
	normalizeLocalPath,
	replaceImageReferences,
	resolveImageReferences,
	SCREENSHOT_MARKER_PATTERN,
} from "./image-references.ts";
import { MarkerJournal, restoreMarkerJournal, type MarkerJournalHost } from "./marker-journal.ts";

interface ScreenshotRuntime {
	journal: MarkerJournal;
	cwd: string;
}

export function registerCondensedScreenshots(
	pi: ExtensionAPI,
	files: ImageFileGateway = createNodeImageFileGateway(),
): void {
	let runtime: ScreenshotRuntime | undefined;

	pi.on("session_start", (_event, ctx) => {
		const host: MarkerJournalHost = {
			appendEntry: (customType, data) => pi.appendEntry(customType, data),
		};
		runtime = {
			journal: new MarkerJournal(host, restoreMarkerJournal(ctx.sessionManager.getBranch())),
			cwd: ctx.cwd,
		};
		composeEditorComponent(
			ctx.ui,
			createScreenshotEditorDecorator({ journal: runtime.journal, files }),
		);
	});

	pi.on("input", async (event) => {
		if (runtime === undefined) return { action: "continue" };
		return transformScreenshotInput(event, runtime, files);
	});

	pi.registerCommand("screenshots", {
		description: "List screenshot markers in the active session branch",
		handler: async (_args, ctx) => {
			if (runtime === undefined || runtime.journal.entries().length === 0) {
				ctx.ui.notify("No screenshots in the active session.", "info");
				return;
			}
			ctx.ui.notify(
				runtime.journal
					.entries()
					.map(([marker, path]) => `[screenshot #${marker}] ${path}`)
					.join("\n"),
				"info",
			);
		},
	});
}

export async function transformScreenshotInput(
	event: Pick<InputEvent, "text" | "images">,
	runtime: ScreenshotRuntime,
	files: ImageFileGateway,
): Promise<InputEventResult> {
	const requested: Array<{ start: number; end: number; value: string; path: string }> = [];
	for (const match of event.text.matchAll(SCREENSHOT_MARKER_PATTERN)) {
		const index = match.index;
		const markerText = match[0];
		const marker = Number(match[1]);
		const path = runtime.journal.pathForMarker(marker);
		if (index === undefined || path === undefined) continue;
		requested.push({ start: index, end: index + markerText.length, value: markerText, path });
	}
	requested.push(
		...resolveImageReferences(event.text, {
			cwd: runtime.cwd,
			validation: files,
		}),
	);
	if (requested.length === 0) return { action: "continue" };

	const ordered = requested.sort((left, right) => left.start - right.start);
	const seen = new Set<string>();
	const loaded: ImageContent[] = [];
	for (const reference of ordered) {
		const path = normalizeLocalPath(reference.path, { cwd: runtime.cwd });
		if (path === undefined || seen.has(path)) continue;
		seen.add(path);
		const image = await files.readImage(path);
		if (image !== undefined) loaded.push(image);
	}
	const rawReferences = resolveImageReferences(event.text, {
		cwd: runtime.cwd,
		validation: files,
	});
	const text = replaceImageReferences(event.text, rawReferences, (reference) =>
		runtime.journal.markerTextForPath(reference.path),
	);
	return {
		action: "transform",
		text,
		images: [...(event.images ?? []), ...loaded],
	};
}
