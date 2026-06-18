import { FakeBrmemGateway } from "@asdl/brmem";
import { describe, expect, test } from "vitest";

import { parseJsonOutput, putHandoffEntry, runScenario } from "../support/run-scenario.ts";

describe("handoff list", () => {
	test("defaults to current branch and ignores non-handoff entries", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		await putHandoffEntry(gateway, { key: "bravo.md", branch: "feat/y", content: "bravo" });
		await putHandoffEntry(gateway, {
			namespace: "handoffs",
			key: "legacy.md",
			branch: "feat/x",
			content: "legacy",
		});
		await putHandoffEntry(gateway, {
			key: "nested/ignore.md",
			branch: "feat/x",
			content: "nested",
		});
		await putHandoffEntry(gateway, {
			key: "alpha_beta.md",
			branch: "feat/x",
			content: "underscore",
		});
		await putHandoffEntry(gateway, { key: "not-md.txt", branch: "feat/x", content: "txt" });

		const run = runScenario(["list", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: "feat/x", existingBranches: ["feat/x"] },
		});

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
		await putHandoffEntry(gateway, { key: "stale.md", branch: "feat/deleted", content: "stale" });

		const hidden = runScenario(["list", "--branch", "feat/deleted"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: [] },
		});
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
		await putHandoffEntry(gateway, { key: "alpha.md", branch: "feat/a", content: "alpha" });
		await putHandoffEntry(gateway, { key: "bravo.md", branch: "feat/b", content: "bravo" });

		const active = runScenario(["list", "--all", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/a"] },
		});
		const all = runScenario(["list", "--all", "--include-deleted", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/a"] },
		});

		expect(await active.exit).toBe(0);
		expect(parseJsonOutput(active)).toMatchObject({
			data: { scope: "all-branches", branch: null, include_deleted: false },
		});
		expect(
			(parseJsonOutput(active) as { data: { handoffs: { slug: string }[] } }).data.handoffs.map(
				(handoff) => handoff.slug,
			),
		).toEqual(["alpha"]);
		expect(await all.exit).toBe(0);
		expect(
			(parseJsonOutput(all) as { data: { handoffs: { slug: string; branch_state: string }[] } })
				.data.handoffs,
		).toEqual([
			expect.objectContaining({ slug: "alpha", branch_state: "active" }),
			expect.objectContaining({ slug: "bravo", branch_state: "deleted" }),
		]);
	});

	test("markdown output sorts by branch then newest then slug", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, { key: "bravo.md", branch: "feat/b", content: "bravo" });
		await putHandoffEntry(gateway, { key: "charlie.md", branch: "feat/a", content: "charlie" });
		await putHandoffEntry(gateway, { key: "alpha.md", branch: "feat/a", content: "alpha" });

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

	test("ignores flat markdown keys that are not strict semantic handoff slugs", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, {
			key: "alpha_beta.md",
			branch: "feat/x",
			content: "underscore",
		});
		await putHandoffEntry(gateway, { key: "Bad_Name.md", branch: "feat/x", content: "upper" });

		const run = runScenario(["list", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: "feat/x", existingBranches: ["feat/x"] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { handoffs: [] } });
	});

	test("detached head and branch/all conflict are durable failures", async () => {
		const detached = runScenario(["list", "--include-deleted", "--format", "json"], {
			gitState: { currentBranch: { type: "detached" } },
		});
		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({ error_type: "detached_head" });

		const conflict = runScenario(["list", "--branch", "feat/x", "--all", "--format", "json"]);
		expect(await conflict.exit).toBe(2);
		expect(parseJsonOutput(conflict)).toMatchObject({
			error_type: "branch_and_all_conflict",
			message: "--branch and --all are mutually exclusive.",
		});
	});
});
