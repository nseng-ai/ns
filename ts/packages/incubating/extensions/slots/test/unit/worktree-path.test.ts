import { describe, expect, test } from "vitest";

import { parseManagedSlotWorktreeRoot } from "@nseng-ai/slots/api";

describe("managed Slot worktree roots", () => {
	test("returns the canonical Slot name for a managed worktree root", () => {
		expect(
			parseManagedSlotWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04",
			),
		).toBe("slot-04");
		expect(
			parseManagedSlotWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-99",
			),
		).toBe("slot-99");
	});

	test("normalizes paths lexically before recognition", () => {
		expect(
			parseManagedSlotWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/ignored/../worktrees/slot-04/.",
			),
		).toBe("slot-04");
	});

	test("rejects a nested path when a worktree root is required", () => {
		expect(
			parseManagedSlotWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04/ts/packages",
			),
		).toBeUndefined();
	});

	test("rejects malformed managed-layout owner segments", () => {
		for (const path of [
			"/Users/example/.local/state/ns/other/repos/ns/worktrees/slot-04",
			"/Users/example/.local/state/ns/slots/other/ns/worktrees/slot-04",
			"/Users/example/.local/state/ns/slots/repos/ns/other/slot-04",
		]) {
			expect(parseManagedSlotWorktreeRoot(path)).toBeUndefined();
		}
	});

	test("rejects malformed Slot basenames and ordinary checkouts", () => {
		for (const path of [
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-100",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/feature-04",
			"/repo",
		]) {
			expect(parseManagedSlotWorktreeRoot(path)).toBeUndefined();
		}
	});
});
