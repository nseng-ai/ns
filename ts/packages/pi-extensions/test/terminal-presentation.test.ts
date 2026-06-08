import { describe, expect, test } from "vitest";

import {
	customMessageText,
	linkifyPrReferences,
	prLinksDetailsFor,
	prLinksFromDetails,
	sanitizeTerminalHyperlinkUrl,
	stripTerminalEscapes,
	terminalHyperlink,
	truncateDisplayLine,
} from "../src/terminal-presentation.ts";

describe("terminal presentation helpers", () => {
	test("strips ANSI SGR escapes", () => {
		expect(stripTerminalEscapes("\x1B[31mred\x1B[0m")).toBe("red");
	});

	test("strips OSC 8 hyperlinks terminated by BEL", () => {
		expect(stripTerminalEscapes("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07")).toBe("#101");
	});

	test("strips OSC 8 hyperlinks terminated by ST", () => {
		expect(stripTerminalEscapes("\x1B]8;;https://github.example/pull/101\x1B\\#101\x1B]8;;\x1B\\")).toBe("#101");
	});

	test("sanitizes terminal hyperlink URLs", () => {
		expect(sanitizeTerminalHyperlinkUrl("http://example.com/path")).toBe("http://example.com/path");
		expect(sanitizeTerminalHyperlinkUrl("https://example.com/a b")).toBe("https://example.com/a%20b");
		expect(sanitizeTerminalHyperlinkUrl("javascript:alert(1)")).toBeUndefined();
		expect(sanitizeTerminalHyperlinkUrl("not a url")).toBeUndefined();
		expect(sanitizeTerminalHyperlinkUrl("https://example.com/\x07bad")).toBeUndefined();
	});

	test("emits terminal hyperlinks with a sanitized URL", () => {
		expect(terminalHyperlink("#101", "https://github.example/pull/101")).toBe(
			"\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07",
		);
	});

	test("extracts plain text from custom message content", () => {
		expect(customMessageText("plain")).toBe("plain");
		expect(
			customMessageText([
				{ type: "text", text: "one" },
				{ type: "image", text: "ignored" },
				{ type: "text", text: "two" },
			]),
		).toBe("one\ntwo");
	});

	test("truncates display lines", () => {
		expect(truncateDisplayLine("abc", 0)).toBe("");
		expect(truncateDisplayLine("abc", -1)).toBe("");
		expect(truncateDisplayLine("abc", 1)).toBe("…");
		expect(truncateDisplayLine("abc", 3)).toBe("abc");
		expect(truncateDisplayLine("abcd", 3)).toBe("ab…");
	});

	test("parses PR links from defensive message details", () => {
		expect(prLinksFromDetails(undefined).size).toBe(0);
		expect(prLinksFromDetails({ prLinks: "not an array" }).size).toBe(0);

		const links = prLinksFromDetails({
			prLinks: [
				{ number: 101, url: "https://github.example/pull/101" },
				{ number: 102.5, url: "https://github.example/pull/102" },
				{ number: "103", url: "https://github.example/pull/103" },
				{ number: 104, url: "javascript:alert(1)" },
				{ number: 105, url: "https://github.example/pull/a b" },
			],
		});

		expect([...links.entries()]).toEqual([
			[101, "https://github.example/pull/101"],
			[105, "https://github.example/pull/a%20b"],
		]);
	});

	test("builds PR link details only for sanitized URLs", () => {
		expect(
			prLinksDetailsFor([
				{ number: 101, url: "https://github.example/pull/101" },
				{ number: 102, url: undefined },
				{ number: 103, url: "javascript:alert(1)" },
			]),
		).toEqual({ prLinks: [{ number: 101, url: "https://github.example/pull/101" }] });
		expect(prLinksDetailsFor([{ number: 101, url: undefined }])).toBeUndefined();
	});

	test("linkifies only known PR references", () => {
		const links = new Map([[101, "https://github.example/pull/101"]]);
		expect(linkifyPrReferences("Merged #101 and #102", links)).toBe(
			"Merged \x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 and #102",
		);
	});
});
