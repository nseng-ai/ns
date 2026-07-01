import { describe, expect, test } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import { runScenario, parseJsonOutput } from "../support/run-scenario.ts";

describe("brmem gc", () => {
	test("dry-runs stale Snapshots without deleting", async () => {
		const gateway = new FakeBrmemGateway({
			localBranches: ["live"],
			entries: [
				{ namespace: "base", branch: "live", key: "keep.md", content: "keep" },
				{ namespace: "base", branch: "stale", key: "old.md", content: "old" },
				{ namespace: "branch-context", branch: "stale", key: "plan.md", content: "plan" },
			],
		});

		const run = runScenario(["gc", "--format", "json"], { gateway });

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toContain("Scanning Branch Memory Snapshot refs…");
		expect(run.stderr.join("")).toContain("Found 2 stale Branch Memory Snapshot refs.");
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				namespaceScope: "all",
				deleted: false,
				staleSnapshots: [
					{
						namespace: "base",
						branch: "stale",
						refName: "refs/brmem/base/stale",
						entryCount: 1,
						deleted: false,
					},
					{
						namespace: "branch-context",
						branch: "stale",
						refName: "refs/brmem/ns/branch-context/stale",
						entryCount: 1,
						deleted: false,
					},
				],
			},
		});

		const after = await gateway.listSnapshots({});
		expect(after.type).toBe("ok");
		if (after.type === "ok") expect(after.value).toHaveLength(3);
	});

	test("summarizes large human output instead of rendering every stale Snapshot", async () => {
		const staleEntries = Array.from({ length: 25 }, (_, index) => ({
			namespace: index % 2 === 0 ? "base" : "branch-context",
			branch: `stale-${index}`,
			key: "note.md",
			content: "note",
		}));

		const run = runScenario(["gc"], {
			fake: {
				localBranches: [],
				entries: staleEntries,
			},
		});

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("Stale Snapshot refs: 25");
		expect(stdout).toContain("By Namespace:");
		expect(stdout).toContain("Base Namespace");
		expect(stdout).toContain("Namespace branch-context");
		expect(stdout).toContain(
			"Detailed stale ref list omitted from human output because it has 25 rows.",
		);
		expect(stdout).toContain("brmem gc --format json");
		expect(stdout).not.toContain("SNAPSHOT REF");
		expect(stdout).not.toContain("refs/brmem/base/stale-0");
	});

	test("deletes stale Snapshots with --yes", async () => {
		const gateway = new FakeBrmemGateway({
			localBranches: ["live"],
			entries: [
				{ namespace: "base", branch: "live", key: "keep.md", content: "keep" },
				{ namespace: "base", branch: "stale", key: "old.md", content: "old" },
				{ namespace: "branch-context", branch: "stale", key: "plan.md", content: "plan" },
			],
		});

		const run = runScenario(["gc", "--yes", "--format", "json"], { gateway });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				deleted: true,
				staleSnapshots: [
					{ namespace: "base", branch: "stale", deleted: true },
					{ namespace: "branch-context", branch: "stale", deleted: true },
				],
			},
		});

		const after = await gateway.listSnapshots({});
		expect(after.type).toBe("ok");
		if (after.type === "ok") {
			expect(after.value).toEqual([
				{
					namespace: "base",
					branch: "live",
					refName: "refs/brmem/base/live",
					entryCount: 1,
				},
			]);
		}
	});

	test("can restrict stale detection to one named Namespace", async () => {
		const gateway = new FakeBrmemGateway({
			localBranches: [],
			entries: [
				{ namespace: "base", branch: "stale", key: "old.md", content: "old" },
				{ namespace: "branch-context", branch: "stale", key: "plan.md", content: "plan" },
			],
		});

		const run = runScenario(["gc", "--namespace", "branch-context", "--format", "json"], {
			gateway,
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				namespaceScope: "branch-context",
				staleSnapshots: [{ namespace: "branch-context", branch: "stale" }],
			},
		});
	});

	test("reports success when no stale Snapshots exist", async () => {
		const run = runScenario(["gc"], {
			fake: {
				localBranches: ["live"],
				entries: [{ namespace: "base", branch: "live", key: "keep.md", content: "keep" }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("No stale Branch Memory Snapshots found.");
	});

	test("rejects conflicting base and namespace filters", async () => {
		const run = runScenario(["gc", "--base", "--namespace", "branch-context", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "base-and-namespace-conflict",
		});
	});
});
