import { describe, expect, test } from "vitest";

import { renderDelete, type DeleteResult } from "../../src/operations/delete.ts";
import { renderGc, type GcResult } from "../../src/operations/gc.ts";

const DELETE_SUCCESS: DeleteResult = {
	branch: "feat/x",
	slug: "alpha",
	key: "alpha.md",
	entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
	deleted: true,
	cancelled: false,
	commit: "abc123",
};

const DELETE_CANCELLED: DeleteResult = {
	branch: "feat/x",
	slug: "alpha",
	key: "alpha.md",
	entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
	deleted: false,
	cancelled: true,
	commit: null,
};

const GC_DRY_RUN: GcResult = {
	entries: [
		{
			branch: "feat/stale",
			branchState: "deleted",
			slug: "stale",
			key: "stale.md",
			entryLocator: "refs/brmem/ns/handoff/feat---stale:stale.md",
			updatedAt: "2026-01-01T00:00:00+00:00",
			action: "would-delete",
			commit: null,
			message: null,
		},
	],
	wouldDeleteCount: 1,
	deletedCount: 0,
	keptCount: 0,
	errorCount: 0,
	dryRun: true,
	cancelled: false,
};

const GC_FORCED_SUCCESS: GcResult = {
	entries: [
		{
			branch: "feat/stale",
			branchState: "deleted",
			slug: "stale",
			key: "stale.md",
			entryLocator: "refs/brmem/ns/handoff/feat---stale:stale.md",
			updatedAt: "2026-01-01T00:00:00+00:00",
			action: "deleted",
			commit: "abc123",
			message: null,
		},
	],
	wouldDeleteCount: 0,
	deletedCount: 1,
	keptCount: 0,
	errorCount: 0,
	dryRun: false,
	cancelled: false,
};

const GC_NO_OP: GcResult = {
	entries: [],
	wouldDeleteCount: 0,
	deletedCount: 0,
	keptCount: 0,
	errorCount: 0,
	dryRun: false,
	cancelled: false,
};

const GC_CANCELLED: GcResult = {
	entries: [
		{
			branch: "feat/stale",
			branchState: "deleted",
			slug: "stale",
			key: "stale.md",
			entryLocator: "refs/brmem/ns/handoff/feat---stale:stale.md",
			updatedAt: "2026-01-01T00:00:00+00:00",
			action: "would-delete",
			commit: null,
			message: null,
		},
	],
	wouldDeleteCount: 1,
	deletedCount: 0,
	keptCount: 0,
	errorCount: 0,
	dryRun: false,
	cancelled: true,
};

const GC_ERROR: GcResult = {
	entries: [
		{
			branch: "feat/stale",
			branchState: "deleted",
			slug: "stale",
			key: "stale.md",
			entryLocator: "refs/brmem/ns/handoff/feat---stale:stale.md",
			updatedAt: "2026-01-01T00:00:00+00:00",
			action: "error",
			commit: null,
			message: "delete failed",
		},
	],
	wouldDeleteCount: 0,
	deletedCount: 0,
	keptCount: 0,
	errorCount: 1,
	dryRun: false,
	cancelled: false,
};

describe("handoff destructive rendering", () => {
	test("renders delete success as a success result block", () => {
		const output = renderDelete(DELETE_SUCCESS, { canEmitAnsi: false });

		expect(output).toContain("Deleted handoff alpha.");
		expect(output).toContain("Branch: feat/x");
		expect(output).toContain("Entry Locator: refs/brmem/ns/handoff/feat---x:alpha.md");
		expect(output).toContain("Commit: abc123");
	});

	test("renders delete cancellation as a refusal result block", () => {
		const output = renderDelete(DELETE_CANCELLED, { canEmitAnsi: false });

		expect(output).toContain("Cancelled handoff delete.");
		expect(output).toContain("No handoff was deleted.");
		expect(output).toContain("alpha");
		expect(output).toContain("feat/x");
	});

	test("renders gc dry-run, no-op, and forced success as success result blocks", () => {
		const dryRunOutput = renderGc(GC_DRY_RUN, { canEmitAnsi: false });
		expect(dryRunOutput).toContain("Would delete 1 handoff(s).");
		expect(dryRunOutput).toContain("would delete deleted feat/stale stale");
		expect(dryRunOutput).toContain("Would delete 1; deleted 0; kept 0; errors 0");

		const forcedOutput = renderGc(GC_FORCED_SUCCESS, { canEmitAnsi: false });
		expect(forcedOutput).toContain("Deleted 1 handoff(s).");
		expect(forcedOutput).toContain("deleted deleted feat/stale stale");
		expect(forcedOutput).toContain("Would delete 0; deleted 1; kept 0; errors 0");

		const noOpOutput = renderGc(GC_NO_OP, { canEmitAnsi: false });
		expect(noOpOutput).toContain("No handoffs for deleted branches.");
		expect(noOpOutput).toContain("Would delete 0; deleted 0; kept 0; errors 0");
	});

	test("renders gc cancellation as a refusal result block", () => {
		const output = renderGc(GC_CANCELLED, { canEmitAnsi: false });

		expect(output).toContain("Cancelled handoff gc.");
		expect(output).toContain("No handoffs were deleted.");
		expect(output).toContain("would delete deleted feat/stale stale");
		expect(output).toContain("Would delete 1; deleted 0; kept 0; errors 0");
	});

	test("renders gc entry errors as a failure result block without changing result data", () => {
		const output = renderGc(GC_ERROR, { canEmitAnsi: false });

		expect(output).toContain("Handoff gc completed with errors.");
		expect(output).toContain("error deleted feat/stale stale: delete failed");
		expect(output).toContain("Would delete 0; deleted 0; kept 0; errors 1");
	});
});
