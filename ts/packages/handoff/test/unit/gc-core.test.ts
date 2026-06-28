import { FakeBrmemGateway } from "@sdl/brmem";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { HandoffStorageDeps } from "../../src/artifact-storage.ts";
import {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
} from "../../src/gc-core.ts";
import type { BranchState, HandoffSummary } from "../../src/inventory.ts";

function createSummary(options: {
	branch: string;
	branch_state: BranchState;
	slug: string;
	key?: string | undefined;
	entry_locator?: string | undefined;
	updated_at?: string | undefined;
}): HandoffSummary {
	const key = options.key ?? `${options.slug}.md`;
	return {
		branch: options.branch,
		branch_state: options.branch_state,
		slug: options.slug,
		key,
		entry_locator: options.entry_locator ?? `refs/brmem/ns/handoff/${options.branch}:${key}`,
		updated_at: options.updated_at ?? "2026-01-01T00:00:00Z",
	};
}

function createDeps(gateway: FakeBrmemGateway): HandoffStorageDeps {
	return {
		brmem: gateway,
		git: new InMemoryGitGateway({ existingBranches: [], currentBranch: { type: "detached" } }),
		cwd: "/repo",
	};
}

async function putHandoff(options: {
	gateway: FakeBrmemGateway;
	branch: string;
	key: string;
	content?: string | undefined;
}): Promise<void> {
	const result = await options.gateway.putEntry({
		namespace: "handoff",
		branch: options.branch,
		key: options.key,
		content: options.content ?? "payload",
	});
	if (result.type === "error") throw new Error(result.error.message);
}

describe("gc-core", () => {
	test("plans garbage collection actions based on branch state", () => {
		const plan = planDeletedBranchGarbageCollection({
			summaries: [
				createSummary({ branch: "feat/live", branch_state: "active", slug: "keep" }),
				createSummary({ branch: "feat/stale", branch_state: "deleted", slug: "stale" }),
			],
		});

		expect(plan.entries.map((entry) => entry.action)).toEqual(["kept_active", "would_delete"]);
		expect(plan.counts).toEqual({ wouldDelete: 1, deleted: 0, kept: 1, error: 0 });
	});

	test("executes planned deletions and reports commits", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoff({ gateway, branch: "feat/stale", key: "stale.md" });

		const plan = planDeletedBranchGarbageCollection({
			summaries: [
				createSummary({
					branch: "feat/stale",
					branch_state: "deleted",
					slug: "stale",
					key: "stale.md",
				}),
			],
		});
		const result = await executeDeletedBranchGarbageCollection(createDeps(gateway), plan);

		expect(result.counts).toEqual({ wouldDelete: 0, deleted: 1, kept: 0, error: 0 });
		expect(result.entries).toEqual([
			{
				branch: "feat/stale",
				branch_state: "deleted",
				slug: "stale",
				key: "stale.md",
				entry_locator: expect.any(String),
				updated_at: "2026-01-01T00:00:00Z",
				action: "deleted",
				commit: expect.any(String),
				message: null,
			},
		]);

		const deleted = await gateway.getEntry({
			namespace: "handoff",
			branch: "feat/stale",
			key: "stale.md",
		});
		expect(deleted.type).toBe("missing");
	});

	test("reports errors for handoffs that disappear before deletion", async () => {
		const gateway = new FakeBrmemGateway();
		const plan = planDeletedBranchGarbageCollection({
			summaries: [
				createSummary({
					branch: "feat/stale",
					branch_state: "deleted",
					slug: "stale",
					key: "stale.md",
				}),
			],
		});

		const result = await executeDeletedBranchGarbageCollection(createDeps(gateway), plan);

		expect(result.counts).toEqual({ wouldDelete: 0, deleted: 0, kept: 0, error: 1 });
		expect(result.entries[0]).toMatchObject({
			action: "error",
			message: expect.stringContaining("Handoff disappeared"),
		});
	});
});
