import { describe, expect, test } from "bun:test";
import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "../src/autobranch-flow.ts";

function ok(stdout = "", stderr = ""): CommandResult {
	return { code: 0, stdout, stderr };
}

function fail(stderr: string): CommandResult {
	return { code: 1, stdout: "", stderr };
}

type UpstreamMode = "contains" | "ahead" | "none" | "failed";

interface HarnessOptions {
	args?: AutobranchFlowInput["args"];
	piResult?: CommandResult;
	prepareResult?: { ok: true; message: string } | { ok: false; error: string };
	commitResult?: { summary: string } | { error: string };
	stashPushFails?: boolean;
	stashListFails?: boolean;
	stashRefMissing?: boolean;
	gtCreateFails?: boolean;
	stashPopFails?: boolean;
	detachedHead?: boolean;
	cleanWorktree?: boolean;
	upstreamMode?: UpstreamMode;
}

function createHarness(options: HarnessOptions = {}) {
	const events: string[] = [];
	const notifications: Array<{ message: string; level: string }> = [];
	const preparedSnapshots: Array<Pick<PendingWorktreeSnapshot, "status" | "diff">> = [];
	let stashMessage = "";
	let statusCalls = 0;
	let head = "abc123def456";
	let currentBranch = "base-branch";
	const upstreamMode = options.upstreamMode ?? "contains";
	const prepareResult = options.prepareResult ?? { ok: true, message: `[cp] Update checkpoint tests\n\n- Add coverage` };
	const commitResult = options.commitResult ?? { summary: "abc123 [cp] Update checkpoint tests" };

	const input: AutobranchFlowInput = {
		cwd: "/repo",
		args: options.args ?? { slug: "test-branch" },
		now: () => 123,
		exec: async (command, args) => {
			events.push(`exec:${command} ${args.join(" ")}`);
			if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
				return ok("/repo\n");
			}
			if (command === "git" && args[0] === "rev-parse" && args.at(-1) === "@{u}") {
				if (upstreamMode === "none") {
					return fail("fatal: no upstream configured for branch 'base-branch'");
				}
				if (upstreamMode === "failed") {
					return fail("rev-parse upstream failed");
				}
				return ok("origin/base-branch\n");
			}
			if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
				return ok(`${head}\n`);
			}
			if (command === "git" && args[0] === "merge-base") {
				return upstreamMode === "ahead" ? { code: 1, stdout: "", stderr: "" } : ok();
			}
			if (command === "git" && args[0] === "symbolic-ref") {
				return options.detachedHead ? fail("not a symbolic ref") : ok("base-branch\n");
			}
			if (command === "git" && args[0] === "status") {
				statusCalls += 1;
				return ok(statusCalls === 1 ? (options.cleanWorktree ? "" : " M file.ts\n") : "");
			}
			if (command === "git" && args[0] === "diff" && args[1] === "HEAD^") {
				return ok("diff --git a/file.ts b/file.ts\n+committed\n");
			}
			if (command === "git" && args[0] === "diff") {
				return ok("diff --git a/file.ts b/file.ts\n");
			}
			if (command === "git" && args[0] === "ls-files") {
				return ok("");
			}
			if (command === "git" && args[0] === "rev-list") {
				return ok("abc123def456 parent987654\n");
			}
			if (command === "git" && args[0] === "log" && args.includes("--format=%B")) {
				return ok("Update committed feature\n");
			}
			if (command === "git" && args[0] === "log" && args.includes("--oneline")) {
				return ok("abc123d Update committed feature\n");
			}
			if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
				return ok(`${currentBranch}\n`);
			}
			if (command === "git" && args[0] === "branch" && args[1] !== "-D") {
				return ok();
			}
			if (command === "git" && args[0] === "branch" && args[1] === "-D") {
				return ok("deleted\n");
			}
			if (command === "git" && args[0] === "reset" && args[1] === "--hard") {
				head = args[2] ?? head;
				return ok(`HEAD is now at ${head}\n`);
			}
			if (command === "git" && args[0] === "checkout") {
				currentBranch = args[1] ?? currentBranch;
				return ok();
			}
			if (command === "pi") {
				return options.piResult ?? ok("generated-branch\n");
			}
			if (command === "git" && args[0] === "check-ref-format") {
				return ok();
			}
			if (command === "git" && args[0] === "show-ref") {
				return { code: 1, stdout: "", stderr: "" };
			}
			if (command === "git" && args[0] === "stash" && args[1] === "push") {
				stashMessage = args.at(-1) ?? "";
				return options.stashPushFails ? fail("stash push failed") : ok("Saved working directory\n");
			}
			if (command === "git" && args[0] === "stash" && args[1] === "list") {
				if (options.stashListFails) {
					return fail("stash list failed");
				}
				return options.stashRefMissing ? ok("stash@{0}\0On base-branch: unrelated stash\n") : ok(`stash@{0}\0On base-branch: ${stashMessage}\n`);
			}
			if (command === "git" && args[0] === "stash" && args[1] === "pop") {
				return options.stashPopFails ? fail("stash conflict") : ok("restored\n");
			}
			if (command === "gt" && args[0] === "trunk") {
				return ok("master\n");
			}
			if (command === "gt" && args[0] === "create") {
				currentBranch = args[1] ?? currentBranch;
				return options.gtCreateFails ? fail("gt create failed") : ok("created\n");
			}
			return ok();
		},
		prepareCheckpointMessage: async (snapshot) => {
			events.push("prepare");
			preparedSnapshots.push(snapshot);
			return prepareResult;
		},
		commitPreparedCheckpointMessage: async () => {
			events.push("commit");
			return commitResult;
		},
		notify: (message, level) => {
			notifications.push({ message, level });
		},
		setStatus: (message) => {
			if (message) {
				events.push(`status:${message}`);
			}
		},
	};

	return { input, events, notifications, preparedSnapshots };
}

function eventIndex(events: string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
}

describe("createAutobranchCheckpointFlow", () => {
	test("message preparation failure happens before stash or Graphite branch creation", async () => {
		const harness = createHarness({ prepareResult: { ok: false, error: "checkpoint prep failed" } });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).toContain("prepare");
		expect(harness.events.some((event) => event.includes("stash push"))).toBe(false);
		expect(harness.events.some((event) => event.startsWith("exec:gt create"))).toBe(false);
		expect(harness.notifications).toContainEqual({ message: "checkpoint prep failed", level: "error" });
	});

	test("clean worktree extracts the latest commit instead of preparing a checkpoint", async () => {
		const harness = createHarness({ cleanWorktree: true, upstreamMode: "none" });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).not.toContain("prepare");
		expect(harness.events.some((event) => event.includes("stash push"))).toBe(false);
		expect(eventIndex(harness.events, "exec:git rev-list --parents -n 1 HEAD")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "exec:git reset --hard parent987654")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "exec:gt create test-branch")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "exec:git reset --hard abc123def456")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create test-branch"));
		expect(harness.notifications.at(-1)?.message).toContain("Moved commit: abc123d Update committed feature");
	});

	test("detached HEAD reports the autobranch-specific checkout guidance", async () => {
		const harness = createHarness({ detachedHead: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).not.toContain("prepare");
		expect(harness.notifications.some((notice) => notice.level === "error" && notice.message.includes("Detached HEAD; check out a branch before running /code:autobranch."))).toBe(true);
	});

	test("dirty worktree with unpublished committed work refuses before preparation", async () => {
		const harness = createHarness({ upstreamMode: "ahead" });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).not.toContain("prepare");
		expect(harness.events.some((event) => event.includes("stash push"))).toBe(false);
		expect(harness.notifications.some((notice) => notice.level === "error" && notice.message.includes("both unpublished committed work and dirty changes"))).toBe(true);
	});

	test("dirty worktree with no upstream keeps the existing path", async () => {
		const harness = createHarness({ upstreamMode: "none" });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).toContain("prepare");
		expect(eventIndex(harness.events, "exec:git stash push")).toBeGreaterThan(-1);
		expect(harness.notifications.at(-1)?.message).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("successful path prepares before stash, branch creation, restore, and commit", async () => {
		const harness = createHarness();

		await createAutobranchCheckpointFlow(harness.input);

		const prepare = eventIndex(harness.events, "prepare");
		const stash = eventIndex(harness.events, "exec:git stash push");
		const create = eventIndex(harness.events, "exec:gt create");
		const restore = eventIndex(harness.events, "exec:git stash pop");
		const commit = eventIndex(harness.events, "commit");
		expect(eventIndex(harness.events, "exec:git rev-parse")).toBeLessThan(prepare);
		expect(eventIndex(harness.events, "exec:git check-ref-format")).toBeLessThan(prepare);
		expect(prepare).toBeLessThan(stash);
		expect(stash).toBeLessThan(create);
		expect(create).toBeLessThan(restore);
		expect(restore).toBeLessThan(commit);
		expect(harness.preparedSnapshots.at(0)?.status).toBe(" M file.ts\n");
		expect(harness.preparedSnapshots.at(0)?.diff).toBe("diff --git a/file.ts b/file.ts\n");
		expect(harness.notifications.at(-1)?.message).toContain("Commit: abc123 [cp] Update checkpoint tests");
	});

	test("preparation warnings surface before transaction success", async () => {
		const harness = createHarness({ args: {}, piResult: fail("pi failed") });

		await createAutobranchCheckpointFlow(harness.input);

		const warning = harness.notifications.findIndex((notice) => notice.message === "Slug model failed; using fallback branch name update-file-ts.");
		const success = harness.notifications.findIndex((notice) => notice.message.includes("New branch: update-file-ts"));
		expect(warning).toBeGreaterThan(-1);
		expect(success).toBeGreaterThan(warning);
	});

	test("stash push failure stops before Graphite branch creation", async () => {
		const harness = createHarness({ stashPushFails: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "exec:git stash push")).toBeGreaterThan(-1);
		expect(harness.events.some((event) => event.startsWith("exec:gt create"))).toBe(false);
		expect(harness.events).not.toContain("commit");
		expect(
			harness.notifications.some((notice) =>
				notice.message.includes("Failed to stash pending changes before branch creation.") && notice.message.includes("stash push failed"),
			),
		).toBe(true);
	});

	test("missing stash ref stops before Graphite branch creation", async () => {
		const harness = createHarness({ stashRefMissing: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "exec:git stash list")).toBeGreaterThan(eventIndex(harness.events, "exec:git stash push"));
		expect(harness.events.some((event) => event.startsWith("exec:gt create"))).toBe(false);
		expect(harness.events).not.toContain("commit");
		expect(
			harness.notifications.some((notice) =>
				notice.message.includes("Stashed pending changes, but could not find the new stash entry") &&
				notice.message.includes("Inspect `git stash list` before continuing."),
			),
		).toBe(true);
	});

	test("Graphite creation failure attempts stash restoration and skips final commit", async () => {
		const harness = createHarness({ gtCreateFails: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "exec:gt create")).toBeGreaterThan(-1);
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create"));
		expect(harness.events).not.toContain("commit");
		expect(harness.notifications.some((notice) => notice.message.includes("Failed to create Graphite branch test-branch"))).toBe(true);
	});

	test("Graphite creation failure plus stash restoration failure reports both problems", async () => {
		const harness = createHarness({ gtCreateFails: true, stashPopFails: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create"));
		expect(harness.events).not.toContain("commit");
		expect(
			harness.notifications.some((notice) =>
				notice.message.includes("Failed to create Graphite branch test-branch") &&
				notice.message.includes("gt create failed") &&
				notice.message.includes("Could not restore pending changes") &&
				notice.message.includes("stash conflict"),
			),
		).toBe(true);
	});

	test("stash restoration failure after branch creation stops before commit", async () => {
		const harness = createHarness({ stashPopFails: true });

		await createAutobranchCheckpointFlow(harness.input);

		expect(eventIndex(harness.events, "exec:gt create")).toBeGreaterThan(-1);
		expect(harness.events).not.toContain("commit");
		expect(harness.notifications.some((notice) => notice.message.includes("Inspect `git stash list` before continuing."))).toBe(true);
	});

	test("final commit failure reports that the branch exists and changes remain", async () => {
		const harness = createHarness({ commitResult: { error: "commit failed" } });

		await createAutobranchCheckpointFlow(harness.input);

		expect(harness.events).toContain("commit");
		expect(
			harness.notifications.some((notice) =>
				notice.message.includes("Branch test-branch exists, but checkpoint commit failed. Pending changes remain on that branch.") &&
				notice.message.includes("commit failed"),
			),
		).toBe(true);
	});
});
