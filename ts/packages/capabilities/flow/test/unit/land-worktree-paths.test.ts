import { describe, expect, test } from "vitest";

import {
	formatConflict,
	formatManualWorktreeConflict,
	formatSlotConflict,
	isManagedSlotPath,
	slotFreeArgs,
	slotNameFromPath,
} from "../../src/land/worktree-paths.ts";
import type { WorktreeConflict } from "../../src/land/types.ts";

const SLOT_PATH = "/Users/me/.local/state/ns/slots/repos/ns/worktrees/slot-04";

describe("land worktree paths", () => {
	test("recognizes managed slots and extracts slot names across path separators", () => {
		expect(isManagedSlotPath(SLOT_PATH)).toBe(true);
		expect(
			isManagedSlotPath("C:\\Users\\me\\AppData\\Local\\ns\\slots\\repos\\ns\\worktrees\\slot-04"),
		).toBe(true);
		expect(isManagedSlotPath("/tmp/slots/repos/ns/worktrees/slot-04")).toBe(false);
		expect(slotNameFromPath(SLOT_PATH)).toBe("slot-04");
	});

	test("builds stable deduplicated slot-free arguments", () => {
		expect(
			slotFreeArgs([
				{ branch: "feature-a", path: SLOT_PATH },
				{ branch: "feature-b", path: SLOT_PATH },
				{ branch: "manual", path: "/repo/manual" },
				{ branch: "manual", path: "/repo/manual-two" },
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
