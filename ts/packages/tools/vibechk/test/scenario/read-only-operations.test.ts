import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runScenario } from "../support/run-scenario.ts";
import { writeTestBundle } from "../support/fixtures.ts";

describe("vibechk read-only operations", () => {
	let storeRoot: string;

	beforeEach(async () => {
		storeRoot = await mkdtemp(join(tmpdir(), "vibechk-test-"));
	});

	afterEach(async () => {
		await rm(storeRoot, { recursive: true, force: true });
	});

	describe("runs", () => {
		it("reports empty state for missing store without creating it", async () => {
			const missingStore = join(storeRoot, "missing-store");

			const tableRun = runScenario(["runs", "--store", missingStore]);
			expect(await tableRun.exit).toBe(0);
			expect(tableRun.stdout.join("")).toBe("No vibechk runs found.\n");

			const jsonRun = runScenario(["runs", "--format", "json", "--store", missingStore]);
			expect(await jsonRun.exit).toBe(0);
			expect(JSON.parse(jsonRun.stdout.join(""))).toEqual([]);

			const tableAliasRun = runScenario(["runs", "--format=table", "--store", missingStore]);
			expect(await tableAliasRun.exit).toBe(0);
			expect(tableAliasRun.stdout.join("")).toBe("No vibechk runs found.\n");
		});

		it("lists bundles newest first in table format", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				startedAt: new Date("2026-05-23T12:00:00Z"),
				model: null,
				resultBranch: null,
			});
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				startedAt: new Date("2026-05-23T12:00:02Z"),
				model: "model-b",
				resultBranch: "vibechk/ccccdddd",
				branchCreated: true,
				metrics: { wallTimeSeconds: 1.2, totalTokens: 10 },
			});

			const run = runScenario(["runs", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const lines = run.stdout.join("").split("\n");
			expect(lines[0]).toContain("RUN ID");
			expect(lines[1]).toContain("ccccdddd");
			expect(lines[1]).toContain("2026-05-23T12:00:02");
			expect(lines[1]).toContain("model-b");
			expect(lines[1]).toContain("vibechk/ccccdddd");
			expect(lines[2]).toContain("aaaabbbb");
			expect(lines[2]).toContain("2026-05-23T12:00:00");
		});

		it("lists bundles in JSON format with snake_case output", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				startedAt: new Date("2026-05-23T12:00:00Z"),
				metrics: { wallTimeSeconds: 1.0, totalTokens: 10 },
			});
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				startedAt: new Date("2026-05-23T12:00:02Z"),
				model: "model-b",
				resultBranch: "vibechk/ccccdddd",
				branchCreated: true,
				metrics: { wallTimeSeconds: 1.2, totalTokens: null },
			});

			const run = runScenario(["runs", "--format", "json", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const entries = JSON.parse(run.stdout.join(""));
			expect(entries).toHaveLength(2);
			expect(entries[0]).toMatchObject({
				run_id: "ccccdddd",
				started_at: "2026-05-23T12:00:02.000Z",
				model: "model-b",
				result_branch: "vibechk/ccccdddd",
				branch_created: true,
				runner_exit_code: 0,
			});
			expect(entries[0].metrics).toMatchObject({
				wall_time_seconds: 1.2,
				total_tokens: null,
			});
			expect(entries[0].run_dir).toContain("ccccdddd");
			expect(entries[1].run_id).toBe("aaaabbbb");
			expect(entries[1].metrics.total_tokens).toBe(10);
		});
	});

	describe("show", () => {
		it("renders a single run report by exact ID", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				metrics: { wallTimeSeconds: 1.25, totalTokens: null },
				planText: "# Plan\n\nDo the thing.\n",
				transcript: "runner output\n",
				diffPatch: "diff --git a/result.txt b/result.txt\n+hello\n",
			});

			const run = runScenario(["show", "aaaabbbb", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const output = run.stdout.join("");
			expect(output).toContain("# Vibechk Run `aaaabbbb`");
			expect(output).toContain("- Status: success");
			expect(output).toContain("- Model: null");
			expect(output).toContain("| Wall time seconds | 1.25 |");
			expect(output).toContain("| Total tokens | null |");
			expect(output).toContain("<summary>Plan</summary>");
			expect(output).toContain("Do the thing.");
			expect(output).toContain("<summary>Transcript</summary>");
			expect(output).toContain("runner output");
			expect(output).toContain("+hello");
		});

		it("resolves unique prefix to full ID", async () => {
			await writeTestBundle(storeRoot, {
				runId: "abc11111",
				planText: "plan 1\n",
			});
			await writeTestBundle(storeRoot, {
				runId: "def22222",
				planText: "plan 2\n",
			});

			const run = runScenario(["show", "abc", "--store", storeRoot]);
			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("# Vibechk Run `abc11111`");
		});

		it("reports error for missing run", async () => {
			const run = runScenario(["show", "missing", "--store", storeRoot]);
			expect(await run.exit).toBe(1);
			expect(run.stderr.join("")).toContain("No run matches prefix 'missing'");
		});

		it("reports error for ambiguous prefix", async () => {
			await writeTestBundle(storeRoot, { runId: "abc11111" });
			await writeTestBundle(storeRoot, { runId: "abc22222" });

			const run = runScenario(["show", "abc", "--store", storeRoot]);
			expect(await run.exit).toBe(1);
			expect(run.stderr.join("")).toContain("Run prefix 'abc' is ambiguous");
			expect(run.stderr.join("")).toContain("abc11111, abc22222");
		});

		it("handles missing optional artifact files", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				// Only bundle.json, no plan/transcript/diff
			});

			const run = runScenario(["show", "aaaabbbb", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const output = run.stdout.join("");
			expect(output).toContain("# Vibechk Run `aaaabbbb`");
			expect(output).toContain("_No transcript captured._");
			expect(output).toContain("_No workdir changes._");
		});
	});

	describe("diff", () => {
		it("renders comparison report with metric deltas", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				metrics: { wallTimeSeconds: 1.0, inputTokens: 2, totalTokens: 5, costUsd: null },
				planText: "# Plan\n\nShared plan.\n",
				diffPatch: "diff --git a/baseline.txt b/baseline.txt\n+baseline\n",
			});
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				metrics: { wallTimeSeconds: 3.0, inputTokens: 4, totalTokens: 9, costUsd: 0.25 },
				planText: "# Plan\n\nShared plan.\n",
				diffPatch: "diff --git a/treatment.txt b/treatment.txt\n+treatment\n",
			});

			const run = runScenario(["diff", "aaaabbbb", "ccccdddd", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const output = run.stdout.join("");
			expect(output).toContain("# Vibechk Comparison");
			expect(output).toContain("Baseline: `aaaabbbb`");
			expect(output).toContain("Treatment: `ccccdddd`");
			expect(output).toContain("- Wall time seconds: 1 -> 3 (+2)");
			expect(output).toContain("- Cost USD: null -> 0.25 (n/a)");
			expect(output).toContain("| Input tokens | 2 | 4 | +2 |");
			expect(output).toContain("| Cost USD | null | 0.25 | n/a |");
			expect(output).toContain("## Configuration");
			expect(output).toContain("| Runner | fake | fake |");
			expect(output).toContain("<summary>Plan</summary>");
			expect(output).toContain("Shared plan.");
			expect(output).toContain("## Baseline Diff");
			expect(output).toContain("+baseline");
			expect(output).toContain("## Treatment Diff");
			expect(output).toContain("+treatment");
		});

		it("warns when plans differ", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				planText: "# Plan A\n",
			});
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				planText: "# Plan B\n",
			});

			const run = runScenario(["diff", "aaaabbbb", "ccccdddd", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const output = run.stdout.join("");
			expect(output).toContain("Warning");
			expect(output).toContain("plans differ");
		});

		it("handles null metrics in both baseline and treatment", async () => {
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				metrics: { wallTimeSeconds: null, totalTokens: null },
			});
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				metrics: { wallTimeSeconds: null, totalTokens: 10 },
			});

			const run = runScenario(["diff", "aaaabbbb", "ccccdddd", "--store", storeRoot]);
			expect(await run.exit).toBe(0);

			const output = run.stdout.join("");
			expect(output).toContain("- Wall time seconds: null -> null (n/a)");
			expect(output).toContain("- Total tokens: null -> 10 (n/a)");
		});
	});

	describe("store resolution", () => {
		it("respects --store over environment variables", async () => {
			await writeTestBundle(storeRoot, { runId: "aaaabbbb" });
			const envStore = join(storeRoot, "env-store");

			const run = runScenario(["runs", "--store", storeRoot], {
				env: { VIBECHK_HOME: envStore, HOME: "/home/tester" },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("aaaabbbb");
		});

		it("uses VIBECHK_HOME when --store is not provided", async () => {
			await writeTestBundle(storeRoot, { runId: "aaaabbbb" });

			const run = runScenario(["runs"], {
				env: { VIBECHK_HOME: storeRoot, HOME: "/home/tester" },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("aaaabbbb");
		});

		it("uses XDG_STATE_HOME/vibechk when VIBECHK_HOME is not set", async () => {
			const xdgBase = join(storeRoot, "xdg-state");
			const vibechkStore = join(xdgBase, "vibechk");
			await writeTestBundle(vibechkStore, { runId: "aaaabbbb" });

			const run = runScenario(["runs"], {
				env: { XDG_STATE_HOME: xdgBase, HOME: "/home/tester" },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("aaaabbbb");
		});

		it("falls back to HOME/.local/state/vibechk when no env vars are set", async () => {
			const home = join(storeRoot, "home");
			const vibechkStore = join(home, ".local", "state", "vibechk");
			await writeTestBundle(vibechkStore, { runId: "aaaabbbb" });

			const run = runScenario(["runs"], {
				env: { HOME: home },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("aaaabbbb");
		});
	});
});
