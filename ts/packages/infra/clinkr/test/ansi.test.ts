import { expect, test } from "vitest";

import { stripAnsi } from "../src/ansi.ts";

test("stripAnsi removes CSI, OSC, and single-character terminal escapes", () => {
	const linked = "\x1b]8;;https://example.invalid\x07link\x1b]8;;\x07";
	const styled = "\x1b[31mred\x1b[0m";
	const single = "\x1bMsingle";

	expect(stripAnsi(`${linked} ${styled} ${single}`)).toBe("link red single");
});
