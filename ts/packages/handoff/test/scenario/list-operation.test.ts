import { describe, expect, test } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-brmem-gateway.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("handoff list", () => {
	test("defaults to current branch and ignores non-handoff entries", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "alpha.md", "feat/x", "alpha");
		gateway.put("handoff", "bravo.md", "feat/y", "bravo");
		gateway.put("handoffs", "legacy.md", "feat/x", "legacy");
		gateway.put("handoff", "nested/ignore.md", "feat/x", "nested");
		gateway.put("handoff", "not-md.txt", "feat/x", "txt");

		const run = runScenario(["list", "--format", "json"], { brmem: gateway, gitState: { currentBranch: "feat/x", existingBranches: ["feat/x"] } });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				scope: "branch",
				branch: "feat/x",
				include_deleted: false,
				handoffs: [
					{
						branch: "feat/x",
						branch_state: "active",
						slug: "alpha",
						key: "alpha.md",
						entry_locator: "refs/brmem/ns/handoff/feat---x:alpha.md",
						updated_at: "2026-01-01T00:00:01+00:00",
					},
				],
			},
		});
	});

	test("explicit branch works in detached head and deleted branch requires include-deleted", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "stale.md", "feat/deleted", "stale");

		const hidden = runScenario(["list", "--branch", "feat/deleted"], { brmem: gateway, gitState: { currentBranch: { type: "detached" }, existingBranches: [] } });
		const shown = runScenario(["list", "--branch", "feat/deleted", "--include-deleted"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: [] },
		});

		expect(await hidden.exit).toBe(0);
		expect(hidden.stdout.join("")).toBe("No handoffs found on branch feat/deleted.\n");
		expect(await shown.exit).toBe(0);
		expect(shown.stdout.join("")).toContain("Handoffs on feat/deleted");
		expect(shown.stdout.join("")).toContain("stale");
	});

	test("all branches defaults to active and can include deleted", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "alpha.md", "feat/a", "alpha");
		gateway.put("handoff", "bravo.md", "feat/b", "bravo");

		const active = runScenario(["list", "--all", "--format", "json"], { brmem: gateway, gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/a"] } });
		const all = runScenario(["list", "--all", "--include-deleted", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/a"] },
		});

		expect(await active.exit).toBe(0);
		expect(parseJsonOutput(active)).toMatchObject({ data: { scope: "all-branches", branch: null, include_deleted: false } });
		expect((parseJsonOutput(active) as { data: { handoffs: { slug: string }[] } }).data.handoffs.map((handoff) => handoff.slug)).toEqual(["alpha"]);
		expect(await all.exit).toBe(0);
		expect((parseJsonOutput(all) as { data: { handoffs: { slug: string; branch_state: string }[] } }).data.handoffs).toEqual([
			expect.objectContaining({ slug: "alpha", branch_state: "active" }),
			expect.objectContaining({ slug: "bravo", branch_state: "deleted" }),
		]);
	});

	test("markdown output sorts by branch then newest then slug", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "bravo.md", "feat/b", "bravo");
		gateway.put("handoff", "charlie.md", "feat/a", "charlie");
		gateway.put("handoff", "alpha.md", "feat/a", "alpha");

		const run = runScenario(["list", "--all", "--include-deleted", "--format", "markdown"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/a"] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("").trimEnd().split("\n")).toEqual([
			"Handoffs across branches",
			"",
			"| branch | state | handoff | updated |",
			"| --- | --- | --- | --- |",
			"| feat/a | active | alpha | 2026-01-01T00:00:03+00:00 |",
			"| feat/a | active | charlie | 2026-01-01T00:00:02+00:00 |",
			"| feat/b | deleted | bravo | 2026-01-01T00:00:01+00:00 |",
		]);
	});

	test("fails when included timestamp is unavailable but skips deleted timestamps in active-only lists", async () => {
		const gateway = new FakeBrmemGateway({ missingUpdatedAtBranches: ["feat/deleted"] });
		gateway.put("handoff", "live.md", "feat/live", "live");
		gateway.put("handoff", "stale.md", "feat/deleted", "stale");

		const active = runScenario(["list", "--all", "--format", "json"], { brmem: gateway, gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/live"] } });
		expect(await active.exit).toBe(0);
		expect((parseJsonOutput(active) as { data: { handoffs: { slug: string }[] } }).data.handoffs.map((handoff) => handoff.slug)).toEqual(["live"]);

		const all = runScenario(["list", "--all", "--include-deleted", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/live"] },
		});
		expect(await all.exit).toBe(2);
		expect(parseJsonOutput(all)).toMatchObject({ error_type: "handoff_updated_at_unavailable" });
	});

	test("detached head and branch/all conflict are durable failures", async () => {
		const detached = runScenario(["list", "--include-deleted", "--format", "json"], { gitState: { currentBranch: { type: "detached" } } });
		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({ error_type: "detached_head" });

		const conflict = runScenario(["list", "--branch", "feat/x", "--all", "--format", "json"]);
		expect(await conflict.exit).toBe(2);
		expect(parseJsonOutput(conflict)).toMatchObject({ error_type: "branch_and_all_conflict", message: "--branch and --all are mutually exclusive." });
	});
});
