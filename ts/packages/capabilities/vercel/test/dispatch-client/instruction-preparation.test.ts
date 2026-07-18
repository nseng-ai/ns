import { describe, expect, test } from "vitest";

import { prepareDispatchInstruction } from "../../src/dispatch-client/instruction-preparation.ts";

const DISPATCH_ID = "dsp_01JABCDEF0123456789";
const ANCHOR_BRANCH = "dispatch/cache-20260322";

describe("prepareDispatchInstruction", () => {
	test("derives the conventional anchor-scoped instruction Entry", () => {
		expect(
			prepareDispatchInstruction({
				dispatchId: DISPATCH_ID,
				anchorBranch: ANCHOR_BRANCH,
				content: "Implement the request exactly.\n",
			}),
		).toEqual({
			status: "ready",
			instruction: {
				dispatchId: DISPATCH_ID,
				content: "Implement the request exactly.\n",
				entry: {
					namespace: "dispatch-context",
					key: `${DISPATCH_ID}/instructions.md`,
					sourceBranch: ANCHOR_BRANCH,
					snapshotRef: "refs/brmem/ns/dispatch-context/dispatch---cache-20260322",
					entryLocator: `refs/brmem/ns/dispatch-context/dispatch---cache-20260322:${DISPATCH_ID}/instructions.md`,
				},
			},
		});
	});

	test("rejects an anchor branch that cannot form a Snapshot Ref", () => {
		expect(
			prepareDispatchInstruction({
				dispatchId: DISPATCH_ID,
				anchorBranch: "dispatch---cache",
				content: "content",
			}),
		).toEqual({
			status: "invalid-dispatch-context",
			dispatchId: DISPATCH_ID,
			message:
				"Invalid branch name \"dispatch---cache\": branch names containing '---' cannot be encoded into refs/brmem",
		});
	});
});
