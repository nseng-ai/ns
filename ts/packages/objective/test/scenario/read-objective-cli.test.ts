import { describe, expect, test } from "vitest";

import { runScenario, parseJsonOutput } from "../support/run-scenario.ts";

describe("objective exec read-objective", () => {
	test("returns TS-native JSON facts and Markdown files for a complete open record", async () => {
		const run = runScenario(["exec", "read-objective", "alpha", "--format", "json"], {
			fake: {
				records: [
					{ slug: "alpha", updates: { "second.md": "# Second\n", "first.md": "# First\n" } },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				status: "ok",
				error: null,
				rootPath: ".asdl/objectives",
				rootExists: true,
				slug: "alpha",
				path: ".asdl/objectives/alpha",
				exists: true,
				closed: false,
				files: {
					objectiveMd: true,
					roadmapMd: true,
					updatesDir: true,
					closedMd: false,
				},
				updates: [
					{ name: "first.md", path: ".asdl/objectives/alpha/updates/first.md" },
					{ name: "second.md", path: ".asdl/objectives/alpha/updates/second.md" },
				],
				updateCount: 2,
				markdownFiles: {
					objectiveMd: { type: "ok", content: "# alpha\n" },
					roadmapMd: { type: "ok", content: "# Roadmap\n" },
					updates: [
						{
							update: { name: "first.md", path: ".asdl/objectives/alpha/updates/first.md" },
							content: { type: "ok", content: "# First\n" },
						},
						{
							update: { name: "second.md", path: ".asdl/objectives/alpha/updates/second.md" },
							content: { type: "ok", content: "# Second\n" },
						},
					],
				},
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("includes raw Markdown content in JSON output", async () => {
		const run = runScenario(["exec", "read-objective", "quiet", "--format", "json"], {
			fake: {
				records: [
					{
						slug: "quiet",
						objectiveMd: "private objective body sentinel\n",
						roadmapMd: "private roadmap body sentinel\n",
						updates: { "update.md": "private update body sentinel\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("private objective body sentinel");
		expect(output).toContain("private roadmap body sentinel");
		expect(output).toContain("private update body sentinel");
	});

	test("renders Markdown facts and raw files with sorted direct updates", async () => {
		const run = runScenario(["exec", "read-objective", "story", "--format", "md"], {
			fake: {
				records: [
					{
						slug: "story",
						objectiveMd: "# Raw Objective\nbody sentinel\n",
						roadmapMd: "# Raw Roadmap\n- [ ] roadmap sentinel\n",
						updates: {
							"b-later.md": "# Later\nlater sentinel\n",
							"a-earlier.md": "# Earlier\nearlier sentinel\n",
							"notes.txt": "not markdown\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("# Objective `story`");
		expect(output).toContain("Root: `.asdl/objectives` (present)");
		expect(output).toContain("Path: `.asdl/objectives/story`");
		expect(output).toContain("State: open");
		expect(output).toContain("Files: objective.md:yes, roadmap.md:yes, updates/:yes, closed.md:no");
		expect(output).toContain("Updates: 2");
		expect(output).toContain("## objective.md");
		expect(output).toContain("# Raw Objective\nbody sentinel");
		expect(output).toContain("## roadmap.md");
		expect(output).toContain("# Raw Roadmap\n- [ ] roadmap sentinel");
		expect(output.indexOf("## updates/a-earlier.md")).toBeLessThan(
			output.indexOf("## updates/b-later.md"),
		);
		expect(output).toContain("# Earlier\nearlier sentinel");
		expect(output).toContain("# Later\nlater sentinel");
		expect(output).not.toContain("not markdown");
		expect(run.stderr).toEqual([]);
	});

	test("notes missing Markdown files and missing updates directory", async () => {
		const run = runScenario(["exec", "read-objective", "partial", "--format", "md"], {
			fake: { directories: [".asdl/objectives/partial"] },
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("_Missing `objective.md`._");
		expect(output).toContain("_Missing `roadmap.md`._");
		expect(output).toContain("_Missing `updates/` directory._");
	});

	test("notes empty direct update inventory", async () => {
		const run = runScenario(["exec", "read-objective", "alpha", "--format", "md"], {
			fake: { records: [{ slug: "alpha" }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("_No direct update Markdown files found._");
	});

	test("missing slug returns a stable negative JSON envelope without usage", async () => {
		const run = runScenario(["exec", "read-objective", "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).not.toContain("Usage:");
		expect(run.stdout.join("")).not.toContain("Usage:");
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "Missing Objective slug. Pass an explicit slug.",
			data: emptyReadData({ status: "missing_slug", error: "missing_slug" }),
		});
	});

	test("invalid slug returns a stable negative JSON envelope", async () => {
		const run = runScenario(["exec", "read-objective", "foo/bar", "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "Invalid Objective slug 'foo/bar'. Pass a single slug, not a path.",
			data: emptyReadData({ status: "invalid_slug", error: "invalid_slug" }),
		});
	});

	test("absent active record returns deterministic facts and ignores archive-only records", async () => {
		const run = runScenario(["exec", "read-objective", "alpha", "--format", "json"], {
			fake: { records: [], directories: [".asdl/objective-archive/alpha"] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "No Objective record found for slug 'alpha'.",
			data: emptyReadData({
				status: "not_found",
				error: "not_found",
				slug: "alpha",
				path: ".asdl/objectives/alpha",
			}),
		});
	});
});

function emptyReadData(options: {
	status: string;
	error: string;
	slug?: string | null | undefined;
	path?: string | null | undefined;
}) {
	return {
		status: options.status,
		error: options.error,
		rootPath: ".asdl/objectives",
		rootExists: false,
		slug: options.slug ?? null,
		path: options.path ?? null,
		exists: false,
		closed: false,
		files: {
			objectiveMd: false,
			roadmapMd: false,
			updatesDir: false,
			closedMd: false,
		},
		updates: [],
		updateCount: 0,
	};
}
