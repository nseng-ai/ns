import { describe, expect, test } from "vitest";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "../src/autobranch/flow.ts";
import { createGitWorldExec, eventIndex, fail, type CommandResult, type PendingWorktreeSnapshot, type UpstreamMode } from "./autobranch-test-helpers.ts";

interface HarnessOptions {
	args?: AutobranchFlowInput["args"];
	piResult?: CommandResult;
	prepareResult?: { ok: true; message: string } | { ok: false; error: string };
	commitResult?: { summary: string } | { error: string };
	shouldStashPushFail?: boolean;
	shouldStashListFail?: boolean;
	isStashRefMissing?: boolean;
	shouldGtCreateFail?: boolean;
	shouldStashPopFail?: boolean;
	isDetachedHead?: boolean;
	isCleanWorktree?: boolean;
	isDirtyAfterAutobranch?: boolean;
	upstreamMode?: UpstreamMode;
}

function createHarness(options: HarnessOptions = {}) {
	const world = createGitWorldExec(options);
	const events: string[] = world.events;
	const preparedSnapshots: Array<Pick<PendingWorktreeSnapshot, "status" | "diff">> = [];
	const prepareResult = options.prepareResult ?? { ok: true, message: `[cp] Update checkpoint tests\n\n- Add coverage` };
	const commitResult = options.commitResult ?? { summary: "abc123 [cp] Update checkpoint tests" };

	const input: AutobranchFlowInput = {
		cwd: "/repo",
		args: options.args ?? { slug: "test-branch" },
		now: () => 123,
		exec: async (command, args) => world.exec(command, args),
		prepareCheckpointMessage: async (snapshot) => {
			events.push("prepare");
			preparedSnapshots.push(snapshot);
			return prepareResult;
		},
		commitPreparedCheckpointMessage: async () => {
			events.push("commit");
			return commitResult;
		},
	};

	return { input, events, preparedSnapshots };
}

function expectError(result: Awaited<ReturnType<typeof createAutobranchCheckpointFlow>>): string {
	expect(result.ok).toBe(false);
	return result.ok ? "" : result.error;
}

function expectSuccess(result: Awaited<ReturnType<typeof createAutobranchCheckpointFlow>>): Extract<typeof result, { ok: true }> {
	expect(result.ok).toBe(true);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result;
}

describe("createAutobranchCheckpointFlow", () => {
	test("message preparation failure happens before stash or Graphite branch creation", async () => {
		const harness = createHarness({ prepareResult: { ok: false, error: "checkpoint prep failed" } });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(expectError(result)).toBe("checkpoint prep failed");
		expect(harness.events).toContain("prepare");
		expect(harness.events.some((event) => event.includes("stash push"))).toBe(false);
		expect(harness.events.some((event) => event.startsWith("gt create"))).toBe(false);
	});

	test("clean worktree extracts the latest commit instead of preparing a checkpoint", async () => {
		const harness = createHarness({ isCleanWorktree: true, upstreamMode: "none" });

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		expect(result.summary).toContain("New branch: test-branch");
		expect(result.summary).toContain("Moved commit: abc123d Add latest commit support");
		expect(result.summary).toContain("Source branch feature/base reset to parent9.");
		expect(result.warnings).toEqual([]);
		expect(harness.events).not.toContain("prepare");
		expect(harness.events.some((event) => event.includes("stash push"))).toBe(false);
		expect(eventIndex(harness.events, "git rev-list --parents -n 1 HEAD")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "git reset --hard parent987654")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "gt create test-branch")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "git reset --hard abc123def456")).toBeGreaterThan(eventIndex(harness.events, "gt create test-branch"));
	});

	test("detached HEAD reports harness-neutral checkout guidance", async () => {
		const harness = createHarness({ isDetachedHead: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).not.toContain("prepare");
		expect(expectError(result)).toContain("Detached HEAD; check out a branch before autobranching.");
	});

	test("dirty worktree creates a branch for the dirty checkpoint without upstream inspection", async () => {
		const harness = createHarness();

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		expect(harness.events).toContain("prepare");
		expect(eventIndex(harness.events, "git stash push")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "gt create test-branch")).toBeGreaterThan(-1);
		expect(harness.events).not.toContain("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
		expect(harness.events).not.toContain("git merge-base --is-ancestor HEAD @{u}");
		expect(result.summary).toContain("New branch: test-branch");
		expect(result.summary).toContain("Stacked on: feature/base");
		expect(result.summary).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("dirty worktree with no upstream keeps the existing path", async () => {
		const harness = createHarness({ upstreamMode: "none" });

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		expect(harness.events).toContain("prepare");
		expect(eventIndex(harness.events, "git stash push")).toBeGreaterThan(-1);
		expect(result.summary).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("dirty worktree ignores upstream-check failure and continues", async () => {
		const harness = createHarness({ upstreamMode: "failed" });

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		expect(harness.events).toContain("prepare");
		expect(eventIndex(harness.events, "git stash push")).toBeGreaterThan(-1);
		expect(harness.events).not.toContain("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
		expect(harness.events).not.toContain("git merge-base --is-ancestor HEAD @{u}");
		expect(result.summary).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("successful path prepares before stash, branch creation, restore, and commit", async () => {
		const harness = createHarness();

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		const prepare = eventIndex(harness.events, "prepare");
		const stash = eventIndex(harness.events, "git stash push");
		const create = eventIndex(harness.events, "gt create");
		const restore = eventIndex(harness.events, "git stash pop");
		const commit = eventIndex(harness.events, "commit");
		expect(eventIndex(harness.events, "git rev-parse")).toBeLessThan(prepare);
		expect(eventIndex(harness.events, "git check-ref-format")).toBeLessThan(prepare);
		expect(harness.events.slice(0, stash)).not.toContain("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
		expect(harness.events.slice(0, stash)).not.toContain("git merge-base --is-ancestor HEAD @{u}");
		expect(prepare).toBeLessThan(stash);
		expect(stash).toBeLessThan(create);
		expect(create).toBeLessThan(restore);
		expect(restore).toBeLessThan(commit);
		expect(harness.preparedSnapshots.at(0)?.status).toBe(" M file.ts\n");
		expect(harness.preparedSnapshots.at(0)?.diff).toBe("diff --git a/file.ts b/file.ts\n+pending\n");
		expect(result.summary).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("preparation warnings are returned with transaction success", async () => {
		const harness = createHarness({ args: {}, piResult: fail("pi failed") });

		const result = expectSuccess(await createAutobranchCheckpointFlow(harness.input));

		expect(result.warnings).toEqual(["Slug model failed; using fallback branch name update-file-ts."]);
		expect(result.summary).toContain("New branch: update-file-ts");
	});

	test("stash push failure stops before Graphite branch creation", async () => {
		const harness = createHarness({ shouldStashPushFail: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "git stash push")).toBeGreaterThan(-1);
		expect(harness.events.some((event) => event.startsWith("gt create"))).toBe(false);
		expect(harness.events).not.toContain("commit");
		expect(expectError(result)).toContain("Failed to stash pending changes before branch creation.");
		expect(expectError(result)).toContain("stash push failed");
	});

	test("missing stash ref stops before Graphite branch creation", async () => {
		const harness = createHarness({ isStashRefMissing: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "git stash list")).toBeGreaterThan(eventIndex(harness.events, "git stash push"));
		expect(harness.events.some((event) => event.startsWith("gt create"))).toBe(false);
		expect(harness.events).not.toContain("commit");
		expect(expectError(result)).toContain("Stashed pending changes, but could not find the new stash entry");
		expect(expectError(result)).toContain("Inspect `git stash list` before continuing.");
	});

	test("Graphite creation failure attempts stash restoration and skips final commit", async () => {
		const harness = createHarness({ shouldGtCreateFail: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "gt create")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "git stash pop")).toBeGreaterThan(eventIndex(harness.events, "gt create"));
		expect(harness.events).not.toContain("commit");
		expect(expectError(result)).toContain("Failed to create Graphite branch test-branch");
	});

	test("Graphite creation failure plus stash restoration failure reports both problems", async () => {
		const harness = createHarness({ shouldGtCreateFail: true, shouldStashPopFail: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "git stash pop")).toBeGreaterThan(eventIndex(harness.events, "gt create"));
		expect(harness.events).not.toContain("commit");
		const error = expectError(result);
		expect(error).toContain("Failed to create Graphite branch test-branch");
		expect(error).toContain("gt create failed");
		expect(error).toContain("Could not restore pending changes");
		expect(error).toContain("stash conflict");
	});

	test("stash restoration failure after branch creation stops before commit", async () => {
		const harness = createHarness({ shouldStashPopFail: true });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "gt create")).toBeGreaterThan(-1);
		expect(harness.events).not.toContain("commit");
		expect(expectError(result)).toContain("Inspect `git stash list` before continuing.");
	});

	test("final commit failure reports that the branch exists and changes remain", async () => {
		const harness = createHarness({ commitResult: { error: "commit failed" } });

		const result = await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).toContain("commit");
		const error = expectError(result);
		expect(error).toContain("Branch test-branch exists, but checkpoint commit failed. Pending changes remain on that branch.");
		expect(error).toContain("commit failed");
	});
});
