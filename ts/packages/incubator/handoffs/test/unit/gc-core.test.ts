import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { HandoffStorageDeps } from "../../src/core/artifact-storage.ts";
import {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
} from "../../src/core/gc-core.ts";
import type { BranchState, HandoffSummary } from "../../src/core/inventory.ts";

function createSummary(options: {
	branch: string;
	branchState: BranchState;
	slug: string;
	key?: string;
	entryLocator?: string;
	updatedAt?: string;
}): HandoffSummary {
	const key = options.key ?? `${options.slug}.md`;
	return {
		branch: options.branch,
		branchState: options.branchState,
		slug: options.slug,
		key,
		entryLocator: options.entryLocator ?? `refs/brmem/ns/handoff/${options.branch}:${key}`,
		updatedAt: options.updatedAt ?? "2026-01-01T00:00:00Z",
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
	content?: string;
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
				createSummary({ branch: "feat/live", branchState: "active", slug: "keep" }),
				createSummary({ branch: "feat/stale", branchState: "deleted", slug: "stale" }),
			],
		});

		expect(plan.entries.map((entry) => entry.action)).toEqual(["keptActive", "wouldDelete"]);
		expect(plan.counts).toEqual({ wouldDelete: 1, deleted: 0, kept: 1, error: 0 });
	});

	test("executes planned deletions and reports commits", async () => {
		const gateway = new FakeBrmemGateway();
		await putHandoff({ gateway, branch: "feat/stale", key: "stale.md" });

		const plan = planDeletedBranchGarbageCollection({
			summaries: [
				createSummary({
					branch: "feat/stale",
					branchState: "deleted",
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
				branchState: "deleted",
				slug: "stale",
				key: "stale.md",
				entryLocator: expect.any(String),
				updatedAt: "2026-01-01T00:00:00Z",
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
					branchState: "deleted",
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
