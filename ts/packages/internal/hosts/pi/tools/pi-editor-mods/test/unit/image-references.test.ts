import { describe, expect, it } from "vitest";

import {
	normalizeLocalPath,
	parseImageCandidates,
	replaceImageReferences,
	resolveImageReferences,
} from "../../src/image-references.ts";

describe("image references", () => {
	it("parses supported absolute, home, file URL, quoted, and shell-escaped candidates", () => {
		const text = String.raw`/tmp/a.png "~/Screen Shot.jpg" file:///tmp/a%20b.webp /tmp/a\ b.GIF`;
		expect(parseImageCandidates(text).map((candidate) => candidate.value)).toEqual([
			"/tmp/a.png",
			"~/Screen Shot.jpg",
			"file:///tmp/a%20b.webp",
			"/tmp/a b.GIF",
		]);
	});

	it("normalizes parsed references without applying filesystem validation", () => {
		const text = "/tmp/missing.png /tmp/found.png";
		expect(parseImageCandidates(text)).toHaveLength(2);
		expect(resolveImageReferences(text)).toMatchObject([
			{ path: "/tmp/missing.png" },
			{ path: "/tmp/found.png" },
		]);
	});

	it("rejects relative, remote URL, unsupported, embedded, and traversal-shaped negatives", () => {
		const text = "a.png https://x/a.png user@example:/a.png /tmp/a.svg prefix/tmp/a.pngx";
		expect(parseImageCandidates(text)).toEqual([]);
	});

	it("normalizes home and file URLs to absolute local paths", () => {
		expect(normalizeLocalPath("~/a.png", { home: "/home/me" })).toBe("/home/me/a.png");
		expect(normalizeLocalPath("file://localhost/tmp/a%20b.png")).toBe("/tmp/a b.png");
		expect(normalizeLocalPath("file://remote/tmp/a.png")).toBeUndefined();
	});

	it("uses longest overlapping replacement and removes source spans once", () => {
		const text = "/tmp/long name.png";
		const result = replaceImageReferences(
			text,
			[
				{ start: 0, end: 9, value: "/tmp/long", path: "/tmp/short.png" },
				{ start: 0, end: text.length, value: text, path: text },
			],
			() => "[screenshot #1]",
		);
		expect(result).toBe("[screenshot #1]");
	});
});
