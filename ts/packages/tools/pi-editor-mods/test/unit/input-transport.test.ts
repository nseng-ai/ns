import type { ImageContent } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { transformScreenshotInput } from "../../src/condensed-screenshots.ts";
import type { ImageFileGateway } from "../../src/image-files.ts";
import { MarkerJournal, restoreMarkerJournal } from "../../src/marker-journal.ts";

class FakeImageFiles implements ImageFileGateway {
	readonly reads: string[] = [];
	private readonly images: ReadonlyMap<string, ImageContent>;

	constructor(images: ReadonlyMap<string, ImageContent>) {
		this.images = new Map(images);
	}

	isSupportedImage(path: string): boolean {
		return this.images.has(path);
	}

	async readImage(path: string): Promise<ImageContent | undefined> {
		this.reads.push(path);
		return this.images.get(path);
	}
}

function image(data: string): ImageContent {
	return { type: "image", data, mimeType: "image/png" };
}

function runtime(): { journal: MarkerJournal; cwd: string } {
	const journal = new MarkerJournal({ appendEntry: () => undefined }, restoreMarkerJournal([]));
	journal.allocate("/a.png");
	journal.allocate("/stale.png");
	return { journal, cwd: "/work" };
}

describe("input transport", () => {
	it("resolves markers and raw paths, preserves images, dedupes in first-reference order", async () => {
		const files = new FakeImageFiles(
			new Map([
				["/a.png", image("a")],
				["/b.gif", image("b")],
			]),
		);
		const existing = image("existing");
		const result = await transformScreenshotInput(
			{ text: "/b.gif [screenshot #1] /a.png /b.gif", images: [existing] },
			runtime(),
			files,
		);
		expect(result).toEqual({
			action: "transform",
			text: "[screenshot #3] [screenshot #1] [screenshot #1] [screenshot #3]",
			images: [existing, image("b"), image("a")],
		});
		expect(files.reads).toEqual(["/b.gif", "/a.png"]);
	});

	it("skips stale and missing marker files without deleting identity", async () => {
		const files = new FakeImageFiles(new Map());
		const state = runtime();
		const result = await transformScreenshotInput(
			{ text: "before [screenshot #2] after" },
			state,
			files,
		);
		expect(result).toEqual({
			action: "transform",
			text: "before [screenshot #2] after",
			images: [],
		});
		expect(state.journal.pathForMarker(2)).toBe("/stale.png");
	});

	it("continues unchanged when there are no references", async () => {
		const result = await transformScreenshotInput(
			{ text: "ordinary prompt" },
			runtime(),
			new FakeImageFiles(new Map()),
		);
		expect(result).toEqual({ action: "continue" });
	});
});
