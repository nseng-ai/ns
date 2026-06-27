import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective exec load-orientations", () => {
	test("renders active orientation files by default", async () => {
		const run = runScenario(["exec", "load-orientations"], {
			fake: {
				records: [
					{ slug: "alpha", orientationMd: "alpha content\n" },
					{ slug: "bravo", orientationMd: "bravo content\n", isClosed: true },
					{ slug: "charlie", orientationMd: "charlie content" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			[
				"### .sdl/objectives/alpha/orientation.md",
				"alpha content",
				"",
				"### .sdl/objectives/charlie/orientation.md",
				"charlie content",
				"",
			].join("\n"),
		);
		expect(run.stderr).toEqual([]);
	});

	test("renders Markdown format identically to default output", async () => {
		const options = { fake: { records: [{ slug: "alpha", orientationMd: "alpha content\n" }] } };
		const plain = runScenario(["exec", "load-orientations"], options);
		const markdown = runScenario(["exec", "load-orientations", "--format", "md"], options);

		expect(await plain.exit).toBe(0);
		expect(await markdown.exit).toBe(0);
		expect(markdown.stdout.join("")).toBe(plain.stdout.join(""));
		expect(markdown.stderr).toEqual([]);
	});

	test("emits the JSON machine envelope with orientation content", async () => {
		const run = runScenario(["exec", "load-orientations", "--format", "json"], {
			fake: {
				records: [
					{ slug: "alpha", orientationMd: "alpha content\n" },
					{ slug: "charlie", orientationMd: "charlie content\n" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				rootPath: ".sdl/objectives",
				records: [
					{
						slug: "alpha",
						path: ".sdl/objectives/alpha/orientation.md",
						content: "alpha content\n",
					},
					{
						slug: "charlie",
						path: ".sdl/objectives/charlie/orientation.md",
						content: "charlie content\n",
					},
				],
				recordCount: 2,
			},
		});
		expect(orientationRecordKeys(parseJsonOutput(run))).toEqual([
			["content", "path", "slug"],
			["content", "path", "slug"],
		]);
		expect(run.stderr).toEqual([]);
	});

	test("succeeds with an empty record list when no active orientations exist", async () => {
		const run = runScenario(["exec", "load-orientations", "--format", "json"], {
			fake: { records: [{ slug: "done", orientationMd: "done\n", isClosed: true }] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			status: "ok",
			exitCode: 0,
			data: { rootPath: ".sdl/objectives", records: [], recordCount: 0 },
		});
		expect(run.stderr).toEqual([]);
	});

	test("fails when an orientation file cannot be read", async () => {
		const run = runScenario(["exec", "load-orientations", "--format", "json"], {
			fake: {
				records: [{ slug: "alpha", orientationMd: "alpha\n" }],
				unreadableFiles: { ".sdl/objectives/alpha/orientation.md": "permission denied" },
			},
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "orientation-unreadable",
			message: "Unable to read .sdl/objectives/alpha/orientation.md: permission denied",
		});
		expect(run.stderr).toEqual([]);
	});
});

function orientationRecordKeys(payload: unknown): string[][] {
	if (typeof payload !== "object" || payload === null || !("data" in payload)) {
		throw new Error("missing data");
	}
	const data = payload.data;
	if (
		typeof data !== "object" ||
		data === null ||
		!("records" in data) ||
		!Array.isArray(data.records)
	) {
		throw new Error("missing records");
	}
	return data.records.map((record: unknown) => {
		if (typeof record !== "object" || record === null) throw new Error("invalid record");
		return Object.keys(record).sort();
	});
}
