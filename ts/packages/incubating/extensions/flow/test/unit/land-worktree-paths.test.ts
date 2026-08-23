import { describe, expect, test } from "vitest";

import {
	formatConflict,
	formatManualWorktreeConflict,
	formatSlotConflict,
	slotFreeArgs,
} from "../../src/land/worktree-paths.ts";
import type { WorktreeConflict } from "../../src/land/types.ts";

const SLOT_PATH = "/Users/me/.local/state/ns/slots/repos/ns/worktrees/slot-04";

describe("land worktree paths", () => {
	test("builds stable deduplicated slot-free arguments", () => {
		expect(
			slotFreeArgs([
				{ type: "managed-slot", branch: "feature-a", path: SLOT_PATH, slotName: "slot-04" },
				{ type: "managed-slot", branch: "feature-b", path: SLOT_PATH, slotName: "slot-04" },
				{ type: "manual-worktree", branch: "manual", path: "/repo/manual" },
				{ type: "manual-worktree", branch: "manual", path: "/repo/manual-two" },
			]),
		).toEqual(["free", "--wt", "slot-04", "--branch", "manual"]);
	});

	test("formats managed and manual conflicts without changing text", () => {
		const managed: WorktreeConflict = {
			type: "managed-slot",
			branch: "feature-a",
			path: SLOT_PATH,
			slotName: "slot-04",
		};
		const manual: WorktreeConflict = {
			type: "manual-worktree",
			branch: "feature-b",
			path: "/repo/manual",
		};
		expect(formatSlotConflict(managed)).toBe(`slot-04 feature-a ${SLOT_PATH}`);
		expect(formatConflict(manual)).toBe("feature-b /repo/manual (manual-worktree)");
		expect(formatManualWorktreeConflict([manual])).toBe(
			"Branch feature-b is checked out in non-slot worktree /repo/manual; detach it manually and rerun.",
		);
	});
});
