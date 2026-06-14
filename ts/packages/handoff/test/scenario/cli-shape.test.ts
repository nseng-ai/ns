import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("handoff CLI shape", () => {
	test("root help/version/runtime", async () => {
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: handoff");
		expect(help.stdout.join("")).toContain("Work with directed handoff artifacts.");
		expect(help.stdout.join("")).toContain("list");
		expect(help.stdout.join("")).toContain("delete");
		expect(help.stdout.join("")).toContain("gc");

		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts\n");
	});

	test("operation help exposes durable flags", async () => {
		const list = runScenario(["list", "--help"]);
		expect(await list.exit).toBe(0);
		expect(list.stdout.join("")).toContain("--all");
		expect(list.stdout.join("")).toContain("--include-deleted");
		expect(list.stdout.join("")).not.toContain("--all-branches");

		const del = runScenario(["delete", "--help"]);
		expect(await del.exit).toBe(0);
		expect(del.stdout.join("")).toContain("Usage: handoff delete");
		expect(del.stdout.join("")).toContain("--branch");
		expect(del.stdout.join("")).toContain("--force");

		const gc = runScenario(["gc", "--help"]);
		expect(await gc.exit).toBe(0);
		expect(gc.stdout.join("")).toContain("--dry-run");
		expect(gc.stdout.join("")).toContain("--force");
	});

	test("list rejects --all-branches", async () => {
		const run = runScenario(["list", "--all-branches"]);
		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("unknown option '--all-branches'");
	});

	test("git failure is a clinkr failure in JSON mode", async () => {
		const run = runScenario(["list", "--format", "json"], {
			gitState: { currentBranch: { type: "failure", error: { code: "not-a-git-repo", message: "fatal: not a git repository" } } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 2, error_type: "not-a-git-repo", message: "fatal: not a git repository" });
	});
});
