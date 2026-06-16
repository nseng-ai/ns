import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective list", () => {
	test("help exposes minimal inventory options and rejects removed status values", async () => {
		const help = runScenario(["list", "--help"]);
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: objective list");
		expect(output).toContain("List Objective records in the current checkout.");
		expect(output).toContain("--names");
		expect(output).toContain("--status");
		expect(output).toContain("--minimal");
		expect(output).not.toContain("--branches");
		expect(output).not.toContain("--updated-branches");

		const invalid = runScenario(["list", "--status", "in-flight"]);
		expect(await invalid.exit).toBe(2);
		expect(invalid.stderr.join("")).toContain("status");
	});

	test("returns minimal JSON envelope with active open records by default", async () => {
		const run = runScenario(["list", "--minimal", "--format", "json"], {
			fake: {
				records: [
					{ slug: "open-one", updates: { "2026-06-15T223520Z-typescript-package-read-objective.md": "# Update\n" } },
					{ slug: "closed-one", closed: true, updates: { "2026-06-14T210415Z-closed.md": "# Closed\n" } },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				trunk_branch: "master",
				root_path: ".asdl/objectives",
				status_filter: "active",
				names_only: false,
				records: [
					{
						slug: "open-one",
						status: "open",
						latest_update_iso: "2026-06-15T22:35:20Z",
					},
				],
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("filters open closed and all active-root records while omitting archive-root records", async () => {
		const fake = {
			records: [{ slug: "alpha" }, { slug: "done", closed: true }],
			directories: [".asdl/objective-archive/archived"],
		};
		const open = runScenario(["list", "--minimal", "--format", "json", "--status", "open"], { fake });
		const closed = runScenario(["list", "--minimal", "--format", "json", "--status", "closed"], { fake });
		const all = runScenario(["list", "--minimal", "--format", "json", "--status", "all"], { fake });

		expect(await open.exit).toBe(0);
		expect(await closed.exit).toBe(0);
		expect(await all.exit).toBe(0);
		expect(recordSlugs(parseJsonOutput(open))).toEqual(["alpha"]);
		expect(recordSlugs(parseJsonOutput(closed))).toEqual(["done"]);
		expect(recordSlugs(parseJsonOutput(all))).toEqual(["alpha", "done"]);
	});

	test("includes incomplete direct child directories as active records", async () => {
		const run = runScenario(["list", "--minimal", "--format", "json"], {
			fake: { directories: [".asdl/objectives/incomplete"] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				trunk_branch: "master",
				root_path: ".asdl/objectives",
				status_filter: "active",
				names_only: false,
				records: [{ slug: "incomplete", status: "open", latest_update_iso: null }],
			},
		});
	});

	test("names-only output emits filtered slug lines without headings", async () => {
		const run = runScenario(["list", "--names", "--status", "all"], {
			fake: { records: [{ slug: "alpha" }, { slug: "beta", closed: true }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("alpha\nbeta\n");
		expect(run.stderr).toEqual([]);
	});

	test("renders minimal Markdown and aliases md to markdown", async () => {
		const run = runScenario(["list", "--minimal", "--format", "md", "--status", "all"], {
			fake: {
				records: [
					{ slug: "alpha", updates: { "2026-06-08-1723-node-runtime-compatibility-hardened.md": "# Update\n" } },
					{ slug: "done", closed: true },
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("# Objective records in this checkout");
		expect(output).toContain("Root: `.asdl/objectives`");
		expect(output).toContain("Status filter: `all`");
		expect(output).toContain("| objective | status | latest update |");
		expect(output).toContain("| alpha | ○ open | 2026-06-08T17:23:00Z |");
		expect(output).toContain("| done | ✓ closed | — |");
	});

	test("dirty markers stay out of JSON but appear in human and Markdown renderers", async () => {
		const fake = { records: [{ slug: "alpha" }] };
		const git = { dirtyPaths: [".asdl/objectives/alpha"] };
		const json = runScenario(["list", "--minimal", "--format", "json"], { fake, git });
		const human = runScenario(["list", "--minimal"], { fake, git });
		const markdown = runScenario(["list", "--minimal", "--format", "markdown"], { fake, git });

		expect(await json.exit).toBe(0);
		expect(await human.exit).toBe(0);
		expect(await markdown.exit).toBe(0);
		expect(parseJsonOutput(json)).toEqual({
			exit_code: 0,
			data: {
				trunk_branch: "master",
				root_path: ".asdl/objectives",
				status_filter: "active",
				names_only: false,
				records: [{ slug: "alpha", status: "open", latest_update_iso: null }],
			},
		});
		expect(human.stdout.join("")).toContain("alpha | ○ open | (x) —");
		expect(markdown.stdout.join("")).toContain("| alpha | ○ open | (x) — |");
	});
});

function recordSlugs(output: unknown): string[] {
	if (typeof output !== "object" || output === null || !("data" in output)) throw new Error("missing data");
	const data = output.data;
	if (typeof data !== "object" || data === null || !("records" in data) || !Array.isArray(data.records)) {
		throw new Error("missing records");
	}
	return data.records.map((record: unknown) => {
		if (typeof record !== "object" || record === null || !("slug" in record) || typeof record.slug !== "string") {
			throw new Error("missing slug");
		}
		return record.slug;
	});
}
