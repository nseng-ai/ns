import type { ExecResult } from "@asdl/core/exec";
import type { CommandResult } from "asdl-dev/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "asdl-dev/pending-worktree";

export type { CommandResult, PendingWorktreeSnapshot };

export type UpstreamMode = "contains" | "ahead" | "none" | "failed";

export interface GitWorldExecOptions {
	isCleanWorktree?: boolean;
	isDetachedHead?: boolean;
	isDirtyAfterAutobranch?: boolean;
	shouldGtCreateFail?: boolean;
	upstreamMode?: UpstreamMode;
	shouldStashPushFail?: boolean;
	shouldStashListFail?: boolean;
	isStashRefMissing?: boolean;
	shouldStashPopFail?: boolean;
	piResult?: CommandResult;
	shouldDeleteBackupFail?: boolean;
}

export function ok(stdout = "", stderr = ""): CommandResult & ExecResult {
	return { code: 0, stdout, stderr, killed: false };
}

export function fail(stderr: string, code = 1): CommandResult & ExecResult {
	return { code, stdout: "", stderr, killed: false };
}

export function eventIndex(events: readonly string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
}

export function createGitWorldExec(options: GitWorldExecOptions = {}): {
	exec: (command: string, args: string[]) => Promise<CommandResult & ExecResult>;
	events: string[];
} {
	const events: string[] = [];
	const sourceBranch = "feature/base";
	let currentBranch = sourceBranch;
	let head = "abc123def456";
	let statusCalls = 0;
	let stashMessage = "";
	const upstreamMode = options.upstreamMode ?? "contains";

	return {
		events,
		exec: async (command, args): Promise<CommandResult & ExecResult> => {
			events.push(`${command} ${args.join(" ")}`);
			if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
				return ok("/repo\n");
			}
			if (command === "git" && args[0] === "symbolic-ref") {
				return options.isDetachedHead === true ? fail("not a symbolic ref") : ok(`${sourceBranch}\n`);
			}
			if (command === "git" && args[0] === "status") {
				statusCalls += 1;
				if (statusCalls === 1) {
					return ok(options.isCleanWorktree === true ? "" : " M file.ts\n");
				}
				return ok(options.isDirtyAfterAutobranch === true ? " M file.ts\n" : "");
			}
			if (command === "git" && args[0] === "diff" && args[1] === "HEAD^") {
				return ok("diff --git a/file.ts b/file.ts\n+committed\n");
			}
			if (command === "git" && args[0] === "diff") {
				return ok("diff --git a/file.ts b/file.ts\n+pending\n");
			}
			if (command === "git" && args[0] === "ls-files") {
				return ok("");
			}
			if (command === "git" && args[0] === "check-ref-format") {
				return ok();
			}
			if (command === "git" && args[0] === "show-ref") {
				return { code: 1, stdout: "", stderr: "", killed: false };
			}
			if (command === "git" && args[0] === "stash" && args[1] === "push") {
				stashMessage = args.at(-1) ?? "";
				return options.shouldStashPushFail === true ? fail("stash push failed") : ok("Saved working directory\n");
			}
			if (command === "git" && args[0] === "stash" && args[1] === "list") {
				if (options.shouldStashListFail === true) {
					return fail("stash list failed");
				}
				return options.isStashRefMissing === true ? ok(`stash@{0}\0On ${sourceBranch}: unrelated stash\n`) : ok(`stash@{0}\0On ${sourceBranch}: ${stashMessage}\n`);
			}
			if (command === "git" && args[0] === "stash" && args[1] === "pop") {
				return options.shouldStashPopFail === true ? fail("stash conflict") : ok("restored\n");
			}
			if (command === "gt" && args[0] === "trunk") {
				return ok("master\n");
			}
			if (command === "gt" && args[0] === "children") {
				return ok("");
			}
			if (command === "gt" && args[0] === "create") {
				if (options.shouldGtCreateFail === true) {
					return fail("gt create failed");
				}
				currentBranch = args[1] ?? currentBranch;
				return ok("created\n");
			}
			if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
				return ok(`${currentBranch}\n`);
			}
			if (command === "git" && args[0] === "branch" && args[1] === "-D") {
				const branchName = args[2] ?? "";
				if (branchName.startsWith("autobranch-backup/")) {
					return options.shouldDeleteBackupFail === true ? fail("delete failed") : ok("deleted\n");
				}
				return ok("deleted\n");
			}
			if (command === "git" && args[0] === "branch") {
				return ok();
			}
			if (command === "git" && args[0] === "for-each-ref") {
				const branchName = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
				if (branchName !== sourceBranch || upstreamMode === "none") {
					return ok();
				}
				if (upstreamMode === "failed") {
					return fail("for-each-ref upstream failed", 128);
				}
				return ok(`origin/${sourceBranch}\n`);
			}
			if (command === "git" && args[0] === "merge-base") {
				return upstreamMode === "contains" ? ok() : { code: 1, stdout: "", stderr: "", killed: false };
			}
			if (command === "git" && args[0] === "rev-list") {
				return ok("abc123def456 parent987654\n");
			}
			if (command === "git" && args[0] === "log" && args.includes("--format=%B")) {
				return ok("Add latest commit support\n");
			}
			if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
				return ok(`${head}\n`);
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
				return options.piResult === undefined ? ok("generated-branch\n") : { ...options.piResult, killed: options.piResult.killed ?? false };
			}
			return ok();
		},
	};
}
