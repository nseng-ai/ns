import { describe, expect, test } from "vitest";

import { BoundedTextTailBuffer } from "@sdl/core/text-tail-buffer";

describe("BoundedTextTailBuffer", () => {
	test("keeps text unchanged while it fits in the byte limit", () => {
		const buffer = new BoundedTextTailBuffer({ maxBytes: 12, omissionLabel: "stderr" });

		buffer.append("hello");
		buffer.append(Buffer.from(" world", "utf8"));

		expect(buffer.toString()).toBe("hello world");
	});

	test("keeps only the byte-bounded tail and reports omitted bytes", () => {
		const buffer = new BoundedTextTailBuffer({ maxBytes: 8, omissionLabel: "stderr" });

		buffer.append("0123456789");
		buffer.append("abcdef");

		expect(buffer.toString()).toBe("… 8 stderr byte(s) omitted\n89abcdef");
	});

	test("uses a neutral omission label by default", () => {
		const buffer = new BoundedTextTailBuffer({ maxBytes: 3 });

		buffer.append("abcdef");

		expect(buffer.toString()).toBe("… 3 text byte(s) omitted\ndef");
	});
});
