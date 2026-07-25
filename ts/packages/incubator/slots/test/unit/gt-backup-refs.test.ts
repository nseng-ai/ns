import { describe, expect, it } from "vitest";

import {
	backupStampFromMs,
	encodeBranchSegment,
	planBackupRefs,
} from "../../src/lifecycle/operations/gt/exec/backup-refs.ts";

describe("backupStampFromMs", () => {
	it("formats a UTC compact timestamp", () => {
		expect(backupStampFromMs(Date.UTC(2026, 6, 12, 12, 0, 0))).toBe("20260712120000");
	});

	it("zero-pads month, day, and time fields", () => {
		expect(backupStampFromMs(Date.UTC(2026, 0, 5, 3, 7, 9))).toBe("20260105030709");
	});
});

describe("encodeBranchSegment", () => {
	it("encodes every slash as a double underscore", () => {
		expect(encodeBranchSegment("feature/deep/branch")).toBe("feature__deep__branch");
	});

	it("leaves slash-free names unchanged", () => {
		expect(encodeBranchSegment("retry-budgets")).toBe("retry-budgets");
	});
});

describe("planBackupRefs", () => {
	it("builds the prefix and one backup ref per branch in input order", () => {
		const plan = planBackupRefs({
			label: "smush",
			stamp: "20260712120000",
			branches: ["retry-budgets", "feature/current"],
		});
		expect(plan.prefix).toBe("backup/smush-20260712120000/");
		expect(plan.refs).toEqual([
			{
				branch: "retry-budgets",
				backupBranch: "backup/smush-20260712120000/retry-budgets",
			},
			{
				branch: "feature/current",
				backupBranch: "backup/smush-20260712120000/feature__current",
			},
		]);
	});
});
