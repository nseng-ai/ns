import { FakeBrmemGateway } from "@asdl/brmem";
import { describe, expect, test } from "vitest";

import { getEntryContent, parseJsonOutput, putHandoffEntry, runScenario } from "../support/run-scenario.ts";

describe("handoff gc", () => {
	test("dry-run preserves deleted branch handoffs", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, { key: "live.md", branch: "feat/live", content: "live" });
		await putHandoffEntry(gateway, { key: "stale.md", branch: "feat/deleted", content: "stale" });
		await putHandoffEntry(gateway, { key: "alpha_beta.md", branch: "feat/deleted", content: "underscore" });

		const run = runScenario(["gc", "--dry-run", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/live"] },
		});

		expect(await run.exit).toBe(0);
		const data = (parseJsonOutput(run) as { data: { would_delete_count: number; deleted_count: number; kept_count: number; error_count: number; dry_run: boolean; cancelled: boolean; entries: { slug: string; action: string }[] } }).data;
		expect(data).toMatchObject({ would_delete_count: 1, deleted_count: 0, kept_count: 1, error_count: 0, dry_run: true, cancelled: false });
		expect(Object.fromEntries(data.entries.map((entry) => [entry.slug, entry.action]))).toEqual({ live: "kept_active", stale: "would_delete" });
		expect(await getEntryContent(gateway, { key: "stale.md", branch: "feat/deleted" })).toBe("stale");
		expect(await getEntryContent(gateway, { key: "alpha_beta.md", branch: "feat/deleted" })).toBe("underscore");
	});

	test("force deletes deleted branch handoffs", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, { key: "live.md", branch: "feat/live", content: "live" });
		await putHandoffEntry(gateway, { key: "stale.md", branch: "feat/deleted", content: "stale" });
		await putHandoffEntry(gateway, { key: "alpha_beta.md", branch: "feat/deleted", content: "underscore" });

		const run = runScenario(["gc", "--force", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: ["feat/live"] },
		});

		expect(await run.exit).toBe(0);
		const data = (parseJsonOutput(run) as { data: { deleted_count: number; kept_count: number; entries: { slug: string; action: string }[] } }).data;
		expect(data.deleted_count).toBe(1);
		expect(data.kept_count).toBe(1);
		expect(Object.fromEntries(data.entries.map((entry) => [entry.slug, entry.action]))).toEqual({ live: "kept_active", stale: "deleted" });
		expect(await getEntryContent(gateway, { key: "stale.md", branch: "feat/deleted" })).toBeUndefined();
		expect(await getEntryContent(gateway, { key: "alpha_beta.md", branch: "feat/deleted" })).toBe("underscore");
		expect(await getEntryContent(gateway, { key: "live.md", branch: "feat/live" })).toBe("live");
	});

	test("interactive accept and decline keep JSON stdout machine-readable", async () => {
		const acceptedGateway = new FakeBrmemGateway();
		await putHandoffEntry(acceptedGateway, { key: "stale.md", branch: "feat/deleted", content: "stale" });
		const accepted = runScenario(["gc"], { brmem: acceptedGateway, gitState: { currentBranch: { type: "detached" }, existingBranches: [] }, stdin: "y\n" });
		expect(await accepted.exit).toBe(0);
		expect(accepted.stderr.join("")).toContain("Would delete 1 handoff(s) for deleted branches:");
		expect(accepted.stderr.join("")).toContain("Delete 1 handoff(s)? [y/N]");
		expect(accepted.stdout.join("")).toContain("Deleted 1 handoff(s) for deleted branches:");
		expect(await getEntryContent(acceptedGateway, { key: "stale.md", branch: "feat/deleted" })).toBeUndefined();

		const declinedGateway = new FakeBrmemGateway();
		await putHandoffEntry(declinedGateway, { key: "stale.md", branch: "feat/deleted", content: "stale" });
		const declined = runScenario(["gc", "--format", "json"], {
			brmem: declinedGateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: [] },
			stdin: "no\n",
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stderr.join("")).toContain("Would delete 1");
		expect(declined.stderr.join("")).toContain("Delete 1 handoff(s)? [y/N]");
		expect(parseJsonOutput(declined)).toMatchObject({ data: { cancelled: true, would_delete_count: 1 } });
		expect(await getEntryContent(declinedGateway, { key: "stale.md", branch: "feat/deleted" })).toBe("stale");
	});

	test("no candidates skips prompt", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoffEntry(gateway, { key: "live.md", branch: "feat/live", content: "live" });
		const run = runScenario(["gc"], { brmem: gateway, gitState: { existingBranches: ["feat/live"], currentBranch: { type: "detached" } } });
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("No handoffs for deleted branches.");
		expect(run.stderr.join("")).not.toContain("Delete 1 handoff");
	});

	test("dry-run and force conflict", async () => {
		const run = runScenario(["gc", "--dry-run", "--force", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "conflicting_flags", message: "--dry-run and --force are mutually exclusive." });
	});
});
