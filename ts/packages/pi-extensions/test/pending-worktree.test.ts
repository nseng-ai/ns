import { describe, expect, test } from "bun:test";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type ExecGit,
	type WorktreeCommandResult,
} from "../src/pending-worktree.ts";

function ok(stdout = "", stderr = ""): WorktreeCommandResult {
	return { code: 0, stdout, stderr };
}

function fail(stderr: string): WorktreeCommandResult {
	return { code: 1, stdout: "", stderr };
}

function commandKey(args: string[]): string {
	return args.join(" ");
}

function createHarness(results: Record<string, WorktreeCommandResult>) {
	const calls: Array<{ args: string[]; timeout: number }> = [];
	const execGit: ExecGit = async (args, timeout) => {
		calls.push({ args, timeout });
		return results[commandKey(args)] ?? fail(`missing fake for ${commandKey(args)}`);
	};
	return { calls, execGit };
}

function successfulResults(overrides: Partial<Record<string, WorktreeCommandResult>> = {}): Record<string, WorktreeCommandResult> {
	return {
		"rev-parse --show-toplevel": ok("/repo\n"),
		"symbolic-ref --short HEAD": ok("feature\n"),
		"status --porcelain=v1": ok(" M file.ts\n"),
		"diff HEAD --no-ext-diff": ok("diff --git a/file.ts b/file.ts\n"),
		...overrides,
	};
}

describe("loadPendingWorktreeSnapshot", () => {
	test("successful snapshot includes root, branch, status, diff, and clean false", async () => {
		const harness = createHarness(successfulResults());

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result).toEqual({
			ok: true,
			snapshot: {
				root: "/repo",
				branch: "feature",
				status: " M file.ts\n",
				diff: "diff --git a/file.ts b/file.ts\n",
				clean: false,
			},
		});
		expect(harness.calls.map((call) => commandKey(call.args))).toEqual([
			"rev-parse --show-toplevel",
			"symbolic-ref --short HEAD",
			"status --porcelain=v1",
			"diff HEAD --no-ext-diff",
		]);
	});

	test("clean status returns clean true rather than an error", async () => {
		const harness = createHarness(successfulResults({ "status --porcelain=v1": ok("") }));

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.snapshot.clean).toBe(true);
			expect(result.snapshot.status).toBe("");
		}
	});

	test("rev-parse failure returns not_git_repo and stops", async () => {
		const harness = createHarness(successfulResults({ "rev-parse --show-toplevel": fail("not a git repository") }));

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result).toEqual({ ok: false, error: { kind: "not_git_repo", message: "Not inside a git repository.", result: fail("not a git repository") } });
		expect(harness.calls.map((call) => commandKey(call.args))).toEqual(["rev-parse --show-toplevel"]);
	});

	test("symbolic-ref failure returns detached_head", async () => {
		const harness = createHarness(successfulResults({ "symbolic-ref --short HEAD": fail("not a symbolic ref") }));

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result).toEqual({ ok: false, error: { kind: "detached_head", message: "Detached HEAD.", result: fail("not a symbolic ref") } });
		expect(harness.calls.map((call) => commandKey(call.args))).toEqual(["rev-parse --show-toplevel", "symbolic-ref --short HEAD"]);
	});

	test("status failure returns status_failed", async () => {
		const harness = createHarness(successfulResults({ "status --porcelain=v1": fail("status failed") }));

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result).toEqual({ ok: false, error: { kind: "status_failed", message: "Could not read git status.", result: fail("status failed") } });
		expect(harness.calls.map((call) => commandKey(call.args))).toEqual([
			"rev-parse --show-toplevel",
			"symbolic-ref --short HEAD",
			"status --porcelain=v1",
		]);
	});

	test("diff failure returns diff_failed", async () => {
		const harness = createHarness(successfulResults({ "diff HEAD --no-ext-diff": fail("diff failed") }));

		const result = await loadPendingWorktreeSnapshot({ cwd: "/repo", execGit: harness.execGit });

		expect(result).toEqual({ ok: false, error: { kind: "diff_failed", message: "Could not read git diff.", result: fail("diff failed") } });
		expect(harness.calls.map((call) => commandKey(call.args))).toEqual([
			"rev-parse --show-toplevel",
			"symbolic-ref --short HEAD",
			"status --porcelain=v1",
			"diff HEAD --no-ext-diff",
		]);
	});
});

describe("formatPendingWorktreeCommandDetails", () => {
	test("uses stderr before stdout and marks killed commands", () => {
		expect(formatPendingWorktreeCommandDetails({ code: 2, stdout: "stdout detail", stderr: "stderr detail" })).toBe("exit 2: stderr detail");
		expect(formatPendingWorktreeCommandDetails({ code: 124, stdout: "stdout detail", stderr: "", killed: true })).toBe(
			"exit 124 (killed or timed out): stdout detail",
		);
		expect(formatPendingWorktreeCommandDetails({ code: 1, stdout: "", stderr: "" })).toBe("exit 1");
	});
});
