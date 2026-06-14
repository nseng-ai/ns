import { describe, expect, it } from "vitest";

import { keyGlobMatches } from "../../src/key-glob.ts";

describe("key glob matching", () => {
	it("preserves Python fnmatchcase slash-crossing star semantics", () => {
		expect(keyGlobMatches("foo/body.md", "foo/*")).toBe(true);
		expect(keyGlobMatches("foo/sub/x.md", "foo/*")).toBe(true);
		expect(keyGlobMatches("foobar/body.md", "foo/*")).toBe(false);
		expect(keyGlobMatches("foo/body.md", "*.md")).toBe(true);
	});

	it("supports question mark and character classes", () => {
		expect(keyGlobMatches("a.md", "?.md")).toBe(true);
		expect(keyGlobMatches("ab.md", "?.md")).toBe(false);
		expect(keyGlobMatches("b.md", "[ab].md")).toBe(true);
		expect(keyGlobMatches("c.md", "[!ab].md")).toBe(true);
	});
});
