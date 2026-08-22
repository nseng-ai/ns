import { describe, expect, test } from "vitest";

import {
	buildTimestampedSavedPlanFileName,
	deriveDeterministicSavedPlanSlug,
	formatLocalSavedPlanTimestamp,
	parseSavedPlanFileName,
} from "../src/index.ts";

describe("Saved Plan filename format", () => {
	test("builds and parses a timestamped filename without losing its discriminated fields", () => {
		const fileName = buildTimestampedSavedPlanFileName(
			"specific-saved-plan",
			"26-01-02T03-04-05",
			10,
		);

		expect(fileName).toBe("specific-saved-plan--26-01-02T03-04-05--10.md");
		expect(parseSavedPlanFileName(fileName)).toEqual({
			format: "timestamped",
			slug: "specific-saved-plan",
			fileName,
			timestamp: "26-01-02T03-04-05",
			timestampNumber: 260102030405,
			sequence: 10,
		});
	});

	test("formats timestamps from local calendar fields", () => {
		const localDate = new Date(2026, 0, 2, 3, 4, 5);

		expect(formatLocalSavedPlanTimestamp(localDate.getTime())).toBe("26-01-02T03-04-05");
	});

	test.each([
		"specific-saved-plan--26-01-01T00-00-00--0.md",
		"specific-saved-plan--26-01-01T00-00-00--01.md",
		"specific-saved-plan--26-01-01T00-00-00---1.md",
		"specific-saved-plan--26-01-01T00-00-00--9007199254740992.md",
	])("rejects noncanonical or unsafe timestamped sequence in %s", (fileName) => {
		expect(parseSavedPlanFileName(fileName)).toBeUndefined();
	});

	test.each([
		"26-00-01T00-00-00",
		"26-13-01T00-00-00",
		"26-02-29T00-00-00",
		"24-02-30T00-00-00",
		"26-04-31T00-00-00",
		"26-01-00T00-00-00",
		"26-01-01T24-00-00",
		"26-01-01T23-60-00",
		"26-01-01T23-59-60",
		"2026-01-01T00-00-00",
		"26-1-01T00-00-00",
	])("rejects invalid or noncanonical local timestamp %s", (timestamp) => {
		expect(parseSavedPlanFileName(`specific-saved-plan--${timestamp}--1.md`)).toBeUndefined();
	});

	test("accepts a valid leap-day timestamp", () => {
		expect(parseSavedPlanFileName("specific-saved-plan--24-02-29T23-59-59--1.md")).toMatchObject({
			format: "timestamped",
			timestampNumber: 240229235959,
		});
	});

	test.each([
		["Invalid Slug", "26-01-01T00-00-00", 1, "Invalid Saved Plan slug"],
		["specific-saved-plan", "26-02-30T00-00-00", 1, "Invalid local Saved Plan timestamp"],
		["specific-saved-plan", "26-01-01T00-00-00", 0, "positive safe integer"],
		["specific-saved-plan", "26-01-01T00-00-00", 1.5, "positive safe integer"],
		[
			"specific-saved-plan",
			"26-01-01T00-00-00",
			Number.MAX_SAFE_INTEGER + 1,
			"positive safe integer",
		],
	] as const)(
		"refuses to build a filename from invalid input %#",
		(slug, timestamp, sequence, message) => {
			expect(() => buildTimestampedSavedPlanFileName(slug, timestamp, sequence)).toThrow(message);
		},
	);

	test("parses a legacy filename into a distinct legacy variant", () => {
		expect(parseSavedPlanFileName("specific-saved-plan.md")).toEqual({
			format: "legacy",
			slug: "specific-saved-plan",
			fileName: "specific-saved-plan.md",
		});
	});

	test.each([
		"specific-saved-plan.txt",
		"Specific-Saved-Plan.md",
		"specific_saved_plan.md",
		"specific-saved-plan--26-01-01T00-00-00--1.md.bak",
		".md",
	])("rejects unsupported filename %s", (fileName) => {
		expect(parseSavedPlanFileName(fileName)).toBeUndefined();
	});
});

describe("Saved Plan content slug derivation", () => {
	test("normalizes links, code, HTML, Unicode, and closing hashes in the first eligible H1", () => {
		const content = new TextEncoder().encode(
			"# [Déploy `Café`](https://example.test) <em>API</em> — Safely ###\n# Later Heading\n",
		);

		expect(deriveDeterministicSavedPlanSlug(content, new TextDecoder().decode(content))).toBe(
			"deploy-cafe-api-safely",
		);
	});

	test("ignores headings inside backtick and tilde fences", () => {
		const markdown = [
			"````md",
			"# Ignore Backtick Fence",
			"```",
			"# Still In Backtick Fence",
			"````",
			"~~~md",
			"# Ignore Tilde Fence",
			"~~~",
			"# Use This Heading",
		].join("\n");
		const content = new TextEncoder().encode(markdown);

		expect(deriveDeterministicSavedPlanSlug(content, markdown)).toBe("use-this-heading");
	});

	test("uses the first eligible H1 and limits its slug to seven words", () => {
		const markdown = [
			"#missing-space",
			"    # Too Deeply Indented",
			"## Not An H1",
			"### Also Not An H1",
			"# One Two Three Four Five Six Seven Eight Nine",
			"# Later Heading",
		].join("\n");
		const content = new TextEncoder().encode(markdown);

		expect(deriveDeterministicSavedPlanSlug(content, markdown)).toBe(
			"one-two-three-four-five-six-seven",
		);
	});

	test("accepts a BOM and up to three spaces before an eligible H1", () => {
		const markdown = "\uFEFF   # Ship The Plan\n";
		const content = new TextEncoder().encode(markdown);

		expect(deriveDeterministicSavedPlanSlug(content, markdown)).toBe("ship-the-plan");
	});

	test("hash fallback is derived from exact input bytes", () => {
		const lfBytes = new TextEncoder().encode("plain body\n");
		const crlfBytes = new TextEncoder().encode("plain body\r\n");

		expect(deriveDeterministicSavedPlanSlug(lfBytes, "plain body")).toBe("saved-plan-9d524694c83e");
		expect(deriveDeterministicSavedPlanSlug(crlfBytes, "plain body")).toBe(
			"saved-plan-2924e9e9e94f",
		);
	});

	test("falls back to exact-byte hashing when an H1 has no slug characters", () => {
		const content = new TextEncoder().encode("# ———\n");

		expect(deriveDeterministicSavedPlanSlug(content, "# ———\n")).toMatch(
			/^saved-plan-[a-f0-9]{12}$/,
		);
	});
});
