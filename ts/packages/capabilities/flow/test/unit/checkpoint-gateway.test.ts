import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import type { ActiveOperation } from "@nseng-ai/sdk";

import { RealCheckpointGateway } from "../../src/checkpoint/checkpoint.ts";

const git = {
	optionalRepoRoot: async () => ({ type: "found" as const, value: "/repo" }),
};

function result(stdout = ""): ExecResult {
	return { code: 0, stdout, stderr: "", type: "exited", signal: null };
}

describe("real checkpoint gateway active operations", () => {
	test("reports exact snapshot commands sequentially and clears after each completion", async () => {
		const calls: string[] = [];
		const snapshots: ActiveOperation[][] = [];
		const runner: CommandRunner = async (command, args) => {
			const display = [command, ...args].join(" ");
			calls.push(display);
			switch (display) {
				case "git symbolic-ref --short HEAD":
					return result("feature/demo\n");
				case "git status --porcelain=v1":
					return result(" M src/app.ts\n");
				case "git diff HEAD --no-ext-diff":
					return result("diff --git a/src/app.ts b/src/app.ts\n");
				default:
					throw new Error(`unexpected command: ${display}`);
			}
		};
		const gateway = new RealCheckpointGateway({
			runner,
			git,
			onActiveOperations: (operations) => snapshots.push([...operations]),
		});

		const loaded = await gateway.loadPendingWorktreeSnapshot({ cwd: "/repo" });

		expect(loaded.ok).toBe(true);
		expect(calls).toEqual([
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(snapshots).toEqual([
			[{ kind: "command", display: "git symbolic-ref --short HEAD" }],
			[],
			[{ kind: "command", display: "git status --porcelain=v1" }],
			[],
			[{ kind: "command", display: "git diff HEAD --no-ext-diff" }],
			[],
		]);
	});

	test("clears the exact command operation when the runner rejects", async () => {
		const snapshots: ActiveOperation[][] = [];
		const runner: CommandRunner = async () => {
			throw new Error("runner failed");
		};
		const gateway = new RealCheckpointGateway({
			runner,
			git,
			onActiveOperations: (operations) => snapshots.push([...operations]),
		});

		await expect(gateway.loadPendingWorktreeSnapshot({ cwd: "/repo" })).rejects.toThrow(
			"runner failed",
		);
		expect(snapshots).toEqual([
			[{ kind: "command", display: "git symbolic-ref --short HEAD" }],
			[],
		]);
	});
});
