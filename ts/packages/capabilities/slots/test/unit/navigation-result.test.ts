import { describe, expect, it } from "vitest";

import { navigationResultSchema } from "../../src/core/navigation-result.ts";

const navigationBase = {
	worktreePath: "/slots/repos/repo/worktrees/slot-01",
	cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
	clipboardCopied: false,
	clipboardSkipped: true,
	clipboardFailureReason: null,
	clipboardFailureDetail: null,
};

describe("navigation result schema", () => {
	it.each([
		{
			cdDirectiveStatus: "inactive",
			cdDirectivePath: null,
			cdDirectiveFailureDetail: null,
		},
		{
			cdDirectiveStatus: "inactive",
			cdDirectivePath: "/tmp/ns-cd",
			cdDirectiveFailureDetail: null,
		},
		{
			cdDirectiveStatus: "written",
			cdDirectivePath: "/tmp/ns-cd",
			cdDirectiveFailureDetail: null,
		},
		{
			cdDirectiveStatus: "failed",
			cdDirectivePath: "/tmp/ns-cd",
			cdDirectiveFailureDetail: "permission denied",
		},
	])("accepts a legal $cdDirectiveStatus directive state", (directive) => {
		expect(navigationResultSchema.safeParse({ ...navigationBase, ...directive }).success).toBe(
			true,
		);
	});

	it.each([
		{
			cdDirectiveStatus: "failed",
			cdDirectivePath: null,
			cdDirectiveFailureDetail: "permission denied",
		},
		{
			cdDirectiveStatus: "failed",
			cdDirectivePath: "/tmp/ns-cd",
			cdDirectiveFailureDetail: null,
		},
		{
			cdDirectiveStatus: "written",
			cdDirectivePath: null,
			cdDirectiveFailureDetail: null,
		},
		{
			cdDirectiveStatus: "inactive",
			cdDirectivePath: null,
			cdDirectiveFailureDetail: "unexpected",
		},
		{
			cdDirectiveStatus: "written",
			cdDirectivePath: "/tmp/ns-cd",
			cdDirectiveFailureDetail: "unexpected",
		},
	])("rejects an illegal $cdDirectiveStatus directive state", (directive) => {
		expect(navigationResultSchema.safeParse({ ...navigationBase, ...directive }).success).toBe(
			false,
		);
	});
});
