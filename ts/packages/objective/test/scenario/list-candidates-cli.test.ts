import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective exec list-candidates", () => {
	test("renders active open Objective candidates as slug-status TSV", async () => {
		const run = runScenario(["exec", "list-candidates"], {
			fake: {
				records: [{ slug: "alpha" }, { slug: "bravo", isClosed: true }, { slug: "charlie" }],
				directories: [".asdl/objective-archive/archived"],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("alpha\topen\ncharlie\topen\n");
		expect(run.stderr).toEqual([]);
	});

	test("emits only slug and status records in the canonical JSON machine envelope", async () => {
		const run = runScenario(["exec", "list-candidates", "--format", "json"], {
			fake: {
				records: [{ slug: "alpha" }, { slug: "bravo", isClosed: true }, { slug: "charlie" }],
				directories: [".asdl/objective-archive/archived"],
			},
		});

		expect(await run.exit).toBe(0);
		const payload = parseJsonOutput(run);
		expect(payload).toEqual({
			exit_code: 0,
			data: {
				records: [
					{ slug: "alpha", status: "open" },
					{ slug: "charlie", status: "open" },
				],
			},
		});
		expect(candidateRecordKeys(payload)).toEqual([
			["slug", "status"],
			["slug", "status"],
		]);
		expect(run.stderr).toEqual([]);
	});

	test("prints no candidate lines when no active open Objective records exist", async () => {
		const run = runScenario(["exec", "list-candidates"], {
			fake: {
				records: [{ slug: "done", isClosed: true }],
				directories: [".asdl/objective-archive/archived"],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("\n");
		expect(run.stderr).toEqual([]);
	});
});

function candidateRecordKeys(payload: unknown): string[][] {
	if (typeof payload !== "object" || payload === null || !("data" in payload))
		throw new Error("missing data");
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
