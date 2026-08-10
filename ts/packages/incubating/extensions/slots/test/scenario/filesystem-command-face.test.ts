import { describe, expect, it } from "vitest";

import {
	completeFilesystemScenario,
	runFilesystemScenario,
} from "../support/run-filesystem-scenario.ts";

const worktrees = [
	{ path: "/repo", branch: "master" },
	{ path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
];

describe("Slot production filesystem command face", () => {
	it("runs a selected filesystem route with injected fake gateways", async () => {
		const run = runFilesystemScenario(["list"], { git: { worktrees } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("slot-01");
	});

	it("adapts completion candidates through the injected fake repository gateway", async () => {
		const run = completeFilesystemScenario(["checkout", "feature/"], {
			git: { localBranches: ["feature/a", "feature/b", "other"] },
		});

		await expect(run.values).resolves.toEqual(["feature/a", "feature/b"]);
	});
});
