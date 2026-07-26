import { describe, expect, test } from "vitest";

import { operationInProgressLabel } from "../../src/land/working-tree-operations.ts";
import type { WorkingTreeStatus } from "../../src/land/types.ts";

const OPERATIONS: ReadonlyArray<
	readonly [NonNullable<WorkingTreeStatus["inProgressOperation"]>, string]
> = [
	["merge", "A merge"],
	["cherry-pick", "A cherry-pick"],
	["revert", "A revert"],
	["rebase", "A rebase"],
	["bisect", "A bisect"],
];

describe("operation-in-progress vocabulary", () => {
	test.each(OPERATIONS)("labels %s as %s", (operation, expectedLabel) => {
		expect(operationInProgressLabel(operation)).toBe(expectedLabel);
	});
});
