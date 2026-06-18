import { describe, expect, it } from "vitest";

import { resolveCurrent, resolveNum, resolveWt } from "../../src/selectors.ts";

describe("slot selectors", () => {
	it("resolves in-range slot numbers", () => {
		expect(resolveNum(2, 3)).toEqual({ type: "ok", slotName: "slot-02" });
	});

	it("rejects out-of-range slot numbers", () => {
		expect(resolveNum(4, 3)).toEqual({ type: "error", message: "--num must be in 1..3 (got 4)." });
	});

	it("resolves valid worktree names", () => {
		expect(resolveWt("slot-01")).toEqual({ type: "ok", slotName: "slot-01" });
	});

	it("rejects invalid worktree names", () => {
		expect(resolveWt("repo")).toEqual({
			type: "error",
			message: "--wt 'repo' is not a valid slot name (e.g. 'slot-01').",
		});
	});

	it("resolves current cwd by basename", () => {
		expect(resolveCurrent("/slots/repos/repo/worktrees/slot-09")).toEqual({
			type: "ok",
			slotName: "slot-09",
		});
	});
});
