import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	buildTimestampedSavedPlanFileName,
	findLatestSavedPlanFile,
	formatLocalSavedPlanTimestamp,
	listSavedPlans,
	parseSavedPlanFileName,
	savePlanContentBytes,
} from "../src/index.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";

const commands = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};
const git = new InMemoryGitGateway({
	repoRoot: "/repo",
	originUrl: "git@github.com:owner/repo.git",
	currentBranch: "feature/plans",
});

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

describe("timestamped durable Saved Plans", () => {
	test("publishes exact bytes at one plus the greatest timestamp sequence and selects numerically", async () => {
		const store = new InMemoryPlanStoreGateway();
		const content = new Uint8Array([
			0xef, 0xbb, 0xbf, 0x23, 0x20, 0x53, 0x68, 0x69, 0x70, 0x20, 0x50, 0x6c, 0x61, 0x6e, 0x20,
			0x53, 0x74, 0x6f, 0x72, 0x65, 0x0d, 0x0a,
		]);
		const options = {
			cwd: "/repo",
			planStoreRoot: "/plans",
			git,
			planStoreGateway: store,
			clock: { nowMs: () => new Date(2026, 0, 2, 3, 4, 5).getTime() },
		};
		const first = await savePlanContentBytes(commands, "ship-plan-store", content, options);
		store.writeFile(
			"/plans/gh--owner--repo/feature---plans/other-valid-plan--26-01-02T03-04-05--10.md",
			"# Existing\n",
		);
		const second = await savePlanContentBytes(commands, "ship-plan-store", content, options);

		expect(first.fileName).toBe("ship-plan-store--26-01-02T03-04-05--1.md");
		expect(second.fileName).toBe("ship-plan-store--26-01-02T03-04-05--11.md");
		expect(store.readBytes(first.filePath)).toEqual(content);
		expect((await findLatestSavedPlanFile(commands, options)).sequence).toBe(11);
	});

	test("lists only timestamped Saved Plan files", async () => {
		const store = new InMemoryPlanStoreGateway();
		const directory = "/plans/gh--owner--repo/feature---plans";
		store.writeFile(`${directory}/unsupported-untimestamped-plan.md`, "# Unsupported\n");
		store.writeFile(`${directory}/current-saved-plan--26-01-02T03-04-05--1.md`, "# Current\n");
		const options = { cwd: "/repo", planStoreRoot: "/plans", git, planStoreGateway: store };

		expect(await listSavedPlans(commands, options)).toMatchObject([
			{ format: "timestamped", slug: "current-saved-plan" },
		]);
		expect((await findLatestSavedPlanFile(commands, options)).slug).toBe("current-saved-plan");
	});

	test("rejects invalid slugs, fatal UTF-8, and whitespace-only content", async () => {
		const options = {
			cwd: "/repo",
			planStoreRoot: "/plans",
			git,
			planStoreGateway: new InMemoryPlanStoreGateway(),
		};
		await expect(
			savePlanContentBytes(commands, "invalid", new Uint8Array([0x23]), options),
		).rejects.toThrow("Invalid Saved Plan slug");
		await expect(
			savePlanContentBytes(commands, "specific-saved-plan", new Uint8Array([0xff]), options),
		).rejects.toThrow("valid UTF-8");
		await expect(
			savePlanContentBytes(
				commands,
				"specific-saved-plan",
				new TextEncoder().encode(" \r\n\t"),
				options,
			),
		).rejects.toThrow("non-whitespace");
	});
});
