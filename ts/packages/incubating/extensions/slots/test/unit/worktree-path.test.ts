import { describe, expect, test } from "vitest";

import { parseManagedSlotWorktreeRoot } from "@nseng-ai/slots/api";

function expectNotManagedSlotWorktreeRoot(path: string): void {
	expect(parseManagedSlotWorktreeRoot(path)).toEqual({
		ok: false,
		error: {
			code: "not-managed-slot-worktree-root",
			message: `Path is not an exact managed Slot worktree root: ${path}`,
		},
	});
}

describe("managed Slot worktree roots", () => {
	test.each([
		["POSIX", "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04"],
		["Windows", "C:\\Users\\example\\AppData\\Local\\ns\\slots\\repos\\ns\\worktrees\\slot-04"],
	])("returns the canonical Slot name for a %s managed worktree root", (_platform, path) => {
		expect(parseManagedSlotWorktreeRoot(path)).toEqual({ ok: true, value: "slot-04" });
	});

	test("accepts the complete canonical Slot name range", () => {
		for (const slotName of ["slot-01", "slot-99"]) {
			expect(
				parseManagedSlotWorktreeRoot(
					`/Users/example/.local/state/ns/slots/repos/ns/worktrees/${slotName}`,
				),
			).toEqual({ ok: true, value: slotName });
		}
	});

	test("normalizes paths lexically before recognition", () => {
		expect(
			parseManagedSlotWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/ignored/../worktrees/slot-04/.",
			),
		).toEqual({ ok: true, value: "slot-04" });
	});

	test("returns a domain failure for a nested path when a worktree root is required", () => {
		for (const path of [
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04/ts/packages",
			"C:\\Users\\example\\AppData\\Local\\ns\\slots\\repos\\ns\\worktrees\\slot-04\\ts\\packages",
		]) {
			expectNotManagedSlotWorktreeRoot(path);
		}
	});

	test("returns a domain failure for malformed managed-layout owner segments", () => {
		for (const path of [
			"/Users/example/.local/state/ns/other/repos/ns/worktrees/slot-04",
			"/Users/example/.local/state/ns/slots/other/ns/worktrees/slot-04",
			"/Users/example/.local/state/ns/slots/repos/ns/other/slot-04",
			"C:\\Users\\example\\AppData\\Local\\ns\\other\\repos\\ns\\worktrees\\slot-04",
			"C:\\Users\\example\\AppData\\Local\\ns\\slots\\other\\ns\\worktrees\\slot-04",
		]) {
			expectNotManagedSlotWorktreeRoot(path);
		}
	});

	test("returns a domain failure for malformed Slot basenames and ordinary checkouts", () => {
		for (const path of [
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-00",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-100",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-aa",
			"C:\\Users\\example\\AppData\\Local\\ns\\slots\\repos\\ns\\worktrees\\slot-4",
			"/Users/example/.local/state/ns/slots/repos/ns/worktrees/feature-04",
			"/repo",
		]) {
			expectNotManagedSlotWorktreeRoot(path);
		}
	});
});
