import { describe, expect, test, vi } from "vitest";
import type { PendingWorktreeError } from "@nseng-ai/capability-kit/pending-worktree";

import {
	dispatchAutobranchCheckpoint,
	type AutobranchDispatchEnv,
	type AutobranchDispatchOutcome,
	type AutobranchDirtyDependencies,
} from "../../src/autobranch/checkpoint-flow.ts";
import { createAutobranchGitGateway } from "../../src/autobranch/git-gateway.ts";
import type { CommandResult, PendingWorktreeSnapshot } from "../../src/autobranch/shared.ts";

const cleanSnapshot: PendingWorktreeSnapshot = {
	root: "/snapshot-root",
	branch: "feature/source",
	status: "",
	diff: "",
	clean: true,
};

const dirtySnapshot: PendingWorktreeSnapshot = {
	...cleanSnapshot,
	status: " M src/app.ts\n",
	diff: "diff --git a/src/app.ts b/src/app.ts\n",
	clean: false,
};

function commandResult(stdout = "", code = 0): CommandResult {
	return { type: "exited", code, stdout, stderr: "", signal: null };
}

function dirtyDependencies(): AutobranchDirtyDependencies {
	return {
		prepareCheckpointMessage: async () => ({ ok: true, message: "[cp] Save work" }),
		commitPreparedCheckpointMessage: async () => ({ summary: "abc123 [cp] Save work" }),
	};
}

async function dispatchMode(
	mode: "any-state" | "require-dirty" | "require-clean",
	env: AutobranchDispatchEnv,
): Promise<AutobranchDispatchOutcome> {
	switch (mode) {
		case "any-state":
			return await dispatchAutobranchCheckpoint({ mode, dirty: dirtyDependencies() }, env);
		case "require-dirty":
			return await dispatchAutobranchCheckpoint({ mode, dirty: dirtyDependencies() }, env);
		case "require-clean":
			return await dispatchAutobranchCheckpoint({ mode }, env);
	}
}

function createEnv(snapshot: PendingWorktreeSnapshot) {
	const createFlowContext = vi.fn(() => {
		const exec = async () => commandResult();
		return {
			cwd: snapshot.root,
			modelSelection: { provider: "test", modelId: "model", thinking: "minimal" as const },
			args: { slug: "---" },
			exec,
			git: createAutobranchGitGateway({ cwd: snapshot.root, exec }),
		};
	});
	const env: AutobranchDispatchEnv = {
		loadSnapshot: async () => ({ ok: true, snapshot }),
		createFlowContext,
	};
	return { env, createFlowContext };
}

describe("dispatchAutobranchCheckpoint", () => {
	test("returns pending-worktree without creating flow context when snapshot loading fails", async () => {
		const error: PendingWorktreeError = {
			kind: "not_git_repo",
			message: "Not inside a git repository.",
			result: commandResult("", 128),
		};
		const createFlowContext = vi.fn();

		const result = await dispatchAutobranchCheckpoint(
			{ mode: "any-state", dirty: dirtyDependencies() },
			{ loadSnapshot: async () => ({ ok: false, error }), createFlowContext },
		);

		expect(result).toEqual({ outcome: "pending-worktree", error });
		expect(createFlowContext).not.toHaveBeenCalled();
	});

	test.each([
		["any-state", "flow"],
		["require-dirty", "refused-clean"],
		["require-clean", "flow"],
	] as const)("dispatches a clean snapshot in %s mode as %s", async (modeName, expected) => {
		const { env, createFlowContext } = createEnv(cleanSnapshot);

		const result = await dispatchMode(modeName, env);

		expect(result.outcome).toBe(expected);
		expect(createFlowContext).toHaveBeenCalledTimes(expected === "flow" ? 1 : 0);
	});

	test.each([
		["any-state", "flow"],
		["require-dirty", "flow"],
		["require-clean", "refused-dirty"],
	] as const)("dispatches a dirty snapshot in %s mode as %s", async (modeName, expected) => {
		const { env, createFlowContext } = createEnv(dirtySnapshot);

		const result = await dispatchMode(modeName, env);

		expect(result.outcome).toBe(expected);
		expect(createFlowContext).toHaveBeenCalledTimes(expected === "flow" ? 1 : 0);
	});

	test("threads onPhase, now, and dirty dependencies into dirty flow", async () => {
		const phases: string[] = [];
		const now = vi.fn(() => 42);
		const prepareCheckpointMessage = vi.fn(async () => ({
			ok: true as const,
			message: "[cp] Save work",
		}));
		const commitPreparedCheckpointMessage = vi.fn(async () => ({
			summary: "abc123 [cp] Save work",
		}));
		const exec = vi.fn(async (command: string, args: string[]) => {
			const rendered = `${command} ${args.join(" ")}`;
			if (rendered === "git rev-parse --verify refs/heads/demo") return commandResult("", 1);
			if (rendered === "git stash list --format=%gd%x00%s") {
				return commandResult("stash@{0}\0pi-autobranch:42:demo\n");
			}
			return commandResult();
		});
		const git = createAutobranchGitGateway({ cwd: dirtySnapshot.root, exec });

		const result = await dispatchAutobranchCheckpoint(
			{
				mode: "require-dirty",
				dirty: { prepareCheckpointMessage, commitPreparedCheckpointMessage },
			},
			{
				loadSnapshot: async () => ({ ok: true, snapshot: dirtySnapshot }),
				createFlowContext: () => ({
					cwd: dirtySnapshot.root,
					modelSelection: { provider: "test", modelId: "model", thinking: "minimal" as const },
					args: { slug: "demo" },
					exec,
					git,
				}),
				onPhase: (message) => phases.push(message),
				now,
			},
		);

		expect(result.outcome).toBe("flow");
		expect(phases).toEqual([
			"Inspecting worktree…",
			"Drafting checkpoint message…",
			"Creating Graphite branch and checkpoint…",
		]);
		expect(prepareCheckpointMessage).toHaveBeenCalledWith(dirtySnapshot);
		expect(commitPreparedCheckpointMessage).toHaveBeenCalledWith("[cp] Save work");
		expect(now).toHaveBeenCalledOnce();
		expect(exec).toHaveBeenCalledWith(
			"git",
			["stash", "push", "--include-untracked", "-m", "pi-autobranch:42:demo"],
			120_000,
		);
	});
});
