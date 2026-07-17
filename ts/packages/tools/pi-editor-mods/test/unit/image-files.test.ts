import { describe, expect, it } from "vitest";

import { mimeTypeForPath } from "../../src/image-files.ts";

describe("image file types", () => {
	it.each([
		["a.png", "image/png"],
		["a.jpg", "image/jpeg"],
		["a.JPEG", "image/jpeg"],
		["a.webp", "image/webp"],
		["a.gif", "image/gif"],
		["a.svg", undefined],
	])("maps %s", (path, expected) => expect(mimeTypeForPath(path)).toBe(expected));
});
