import { describe, expect, test } from "vitest";

import {
	buildTimestampedSavedPlanFileName,
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

	test.each([
		"specific-saved-plan.md",
		"specific-saved-plan.txt",
		"Specific-Saved-Plan.md",
		"specific_saved_plan.md",
		"specific-saved-plan--26-01-01T00-00-00--1.md.bak",
		".md",
	])("rejects unsupported filename %s", (fileName) => {
		expect(parseSavedPlanFileName(fileName)).toBeUndefined();
	});
});
