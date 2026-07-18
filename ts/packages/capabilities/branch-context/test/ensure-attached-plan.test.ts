import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_NAMESPACE,
	BranchContextNamespaceInvalidError,
	UnsupportedAttachedPlanKeyError,
	buildBranchContextPlanKey,
	ensureAttachedPlan,
} from "@nseng-ai/branch-context/api";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";

const BRANCH = "dispatch/example";
const KEY = buildBranchContextPlanKey("example-dispatch-plan");
const CONTENT = "# Exact plan\n\nImplement this.\n";
const SOURCE_FILE = "/plans/example-plan.md";
const SNAPSHOT_REF = "refs/brmem/ns/branch-context/dispatch---example";
const ENTRY_LOCATOR = `${SNAPSHOT_REF}:${KEY}`;

describe("ensureAttachedPlan", () => {
	test("creates an absent Attached Plan and returns pinned attachment evidence", async () => {
		const brmem = new InMemoryBranchMemoryGateway();

		const result = await ensureAttachedPlan({
			brmem,
			branch: BRANCH,
			key: KEY,
			content: CONTENT,
			sourceFile: SOURCE_FILE,
		});

		expect(result).toMatchObject({
			type: "created",
			namespace: BRANCH_CONTEXT_NAMESPACE,
			branch: BRANCH,
			key: KEY,
			snapshotRef: SNAPSHOT_REF,
			entryLocator: ENTRY_LOCATOR,
			sourceFile: SOURCE_FILE,
		});
		expect(result.type === "created" ? result.commit : "").not.toBe("");
		expect(brmem.attachPlanCalls).toEqual([
			{
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: BRANCH,
				key: KEY,
				content: CONTENT,
			},
		]);
	});

	test("reuses byte-identical content without mutation and pins the inspected commit", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: BRANCH, key: KEY, content: CONTENT, commit: "existing-commit" }],
		});

		const result = await ensureAttachedPlan({
			brmem,
			branch: BRANCH,
			key: KEY,
			content: CONTENT,
			sourceFile: SOURCE_FILE,
		});

		expect(result).toEqual({
			type: "reused",
			namespace: BRANCH_CONTEXT_NAMESPACE,
			branch: BRANCH,
			key: KEY,
			snapshotRef: SNAPSHOT_REF,
			entryLocator: ENTRY_LOCATOR,
			commit: "existing-commit",
			sourceFile: SOURCE_FILE,
		});
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(brmem.getAttachedPlanCalls).toEqual([{ branch: BRANCH, key: KEY }]);
	});

	test("returns a typed coordinate-only conflict when existing content differs", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: BRANCH, key: KEY, content: "# Different plan\n" }],
		});

		const result = await ensureAttachedPlan({
			brmem,
			branch: BRANCH,
			key: KEY,
			content: CONTENT,
			sourceFile: SOURCE_FILE,
		});

		expect(result).toEqual({
			type: "conflict",
			code: "attached-plan-content-conflict",
			namespace: BRANCH_CONTEXT_NAMESPACE,
			branch: BRANCH,
			key: KEY,
		});
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("preserves refusal for an invalid Branch Context Namespace", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: BRANCH, key: "notes.txt", content: "unsupported" }],
		});

		await expect(
			ensureAttachedPlan({
				brmem,
				branch: BRANCH,
				key: KEY,
				content: CONTENT,
				sourceFile: SOURCE_FILE,
			}),
		).rejects.toBeInstanceOf(BranchContextNamespaceInvalidError);
		expect(brmem.getAttachedPlanCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("rejects keys outside the named Markdown Attached Plan policy", async () => {
		const brmem = new InMemoryBranchMemoryGateway();

		await expect(
			ensureAttachedPlan({
				brmem,
				branch: BRANCH,
				key: "plan.md",
				content: CONTENT,
				sourceFile: SOURCE_FILE,
			}),
		).rejects.toBeInstanceOf(UnsupportedAttachedPlanKeyError);
		expect(brmem.listAttachedPlansCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});
});
