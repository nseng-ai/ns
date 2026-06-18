import { describe, expect, test } from "vitest";

import {
	managedRegionBounds,
	parseManagedRegion,
	replaceManagedRegion,
	replaceMalformedManagedRegionFromBegin,
} from "@asdl/core/managed-region";

describe("managed region bounds", () => {
	test("finds valid exact marker bounds", () => {
		expect(
			managedRegionBounds({
				text: "prefix <s>body<e> suffix",
				startMarker: "<s>",
				endMarker: "<e>",
			}),
		).toEqual({ type: "found", start: 7, end: 17 });
	});

	test("reports missing when neither exact marker is present", () => {
		expect(managedRegionBounds({ text: "no block", startMarker: "<s>", endMarker: "<e>" })).toEqual(
			{ type: "missing" },
		);
	});

	test("rejects malformed exact marker layouts", () => {
		expect(
			managedRegionBounds({ text: "<s>one<s><e>", startMarker: "<s>", endMarker: "<e>" }),
		).toMatchObject({ type: "malformed" });
		expect(
			managedRegionBounds({ text: "<s>one<e><e>", startMarker: "<s>", endMarker: "<e>" }),
		).toMatchObject({ type: "malformed" });
		expect(
			managedRegionBounds({ text: "<s>one", startMarker: "<s>", endMarker: "<e>" }),
		).toMatchObject({ type: "malformed" });
		expect(
			managedRegionBounds({ text: "one<e>", startMarker: "<s>", endMarker: "<e>" }),
		).toMatchObject({ type: "malformed" });
		expect(
			managedRegionBounds({ text: "<e>bad<s>", startMarker: "<s>", endMarker: "<e>" }),
		).toMatchObject({ type: "malformed" });
	});
});

describe("managed region comment parsing", () => {
	test("parses metadata and extracts a custom body from a valid comment-prefixed region", () => {
		const text =
			"before\n<!-- test:begin key=value -->\n<wrap>Body</wrap>\n<!-- test:end -->\nafter";
		const parsed = parseManagedRegion({
			text,
			markers: { beginPrefix: "<!-- test:begin", end: "<!-- test:end -->" },
			parseMetadata: (beginComment) =>
				beginComment.includes("key=value") ? { key: "value" } : undefined,
			extractBody: (rawBody) => rawBody.replace("<wrap>", "").replace("</wrap>", "").trim(),
		});

		expect(parsed).toMatchObject({
			type: "found",
			metadata: { key: "value" },
			body: "Body",
			start: 7,
			end: text.indexOf("<!-- test:end -->") + "<!-- test:end -->".length,
			beginComment: "<!-- test:begin key=value -->",
			rawBody: "\n<wrap>Body</wrap>\n",
		});
	});

	test("reports missing when neither comment marker is present", () => {
		expect(
			parseManagedRegion({
				text: "no block",
				markers: { beginPrefix: "<!-- test:begin", end: "<!-- test:end -->" },
			}),
		).toEqual({ type: "missing" });
	});

	test("rejects malformed comment-prefixed regions", () => {
		const markers = { beginPrefix: "<!-- test:begin", end: "<!-- test:end -->" };

		expect(
			parseManagedRegion({ text: "<!-- test:begin key=value\nbody\n<!-- test:end -->", markers }),
		).toMatchObject({ type: "malformed" });
		expect(
			parseManagedRegion({ text: "<!-- test:begin key=value -->\nbody", markers }),
		).toMatchObject({ type: "malformed" });
		expect(parseManagedRegion({ text: "<!-- test:end -->", markers })).toMatchObject({
			type: "malformed",
		});
		expect(
			parseManagedRegion({
				text: "<!-- test:begin --><!-- test:begin --><!-- test:end -->",
				markers,
			}),
		).toMatchObject({ type: "malformed" });
		expect(
			parseManagedRegion({
				text: "<!-- test:begin -->body<!-- test:end --><!-- test:end -->",
				markers,
			}),
		).toMatchObject({ type: "malformed" });
		expect(
			parseManagedRegion({
				text: "<!-- test:begin -->body<!-- test:end -->",
				markers,
				parseMetadata: () => undefined,
			}),
		).toMatchObject({ type: "malformed" });
	});
});

describe("managed region replacement", () => {
	test("replaces found bounds with normalized surrounding whitespace", () => {
		expect(
			replaceManagedRegion({
				text: "Intro\n\nOLD\n\nFooter",
				replacement: "NEW",
				start: 7,
				end: 10,
			}),
		).toBe("Intro\n\nNEW\n\nFooter");
	});

	test("replaces malformed content from the first begin prefix", () => {
		expect(
			replaceMalformedManagedRegionFromBegin({
				text: "Intro\n\n<!-- begin --> broken",
				beginPrefix: "<!-- begin",
				replacement: "NEW",
			}),
		).toBe("Intro\n\nNEW");
	});
});
