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

	isSupportedImage(): boolean {
		throw new Error("submission must not prevalidate image paths");
	}

	async readImage(path: string): Promise<ImageContent | undefined> {
		this.reads.push(path);
		return this.images.get(path);
	}
}

function image(data: string): ImageContent {
	return { type: "image", data, mimeType: "image/png" };
}

function runtime(): { journal: MarkerJournal } {
	const journal = new MarkerJournal({ appendEntry: () => undefined }, restoreMarkerJournal([]));
	journal.allocate("/a.png");
	journal.allocate("/stale.png");
	return { journal };
}

describe("input transport", () => {
	it("reads each unique path once in first-reference order and rewrites successful raw paths", async () => {
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

	it("uses one marker-initiated read to rewrite a duplicate raw path", async () => {
		const files = new FakeImageFiles(new Map([["/a.png", image("a")]]));
		const result = await transformScreenshotInput(
			{ text: "[screenshot #1] /a.png" },
			runtime(),
			files,
		);
		expect(result).toEqual({
			action: "transform",
			text: "[screenshot #1] [screenshot #1]",
			images: [image("a")],
		});
		expect(files.reads).toEqual(["/a.png"]);
	});

	it("leaves failed raw reads unchanged and allocates no marker", async () => {
		const files = new FakeImageFiles(new Map());
		const state = runtime();
		const result = await transformScreenshotInput({ text: "/missing.png" }, state, files);
		expect(result).toEqual({ action: "transform", text: "/missing.png", images: [] });
		expect(state.journal.markerForPath("/missing.png")).toBeUndefined();
		expect(files.reads).toEqual(["/missing.png"]);
	});

	it("keeps stale marker text and identity when its read fails", async () => {
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
