import { describe, expect, test } from "bun:test";
import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import {
	prepareLatestCommitAutobranchPlan,
	runLatestCommitAutobranchTransaction,
	type LatestCommitAutobranchPlan,
	type LatestCommitTransactionInput,
} from "../src/autobranch-latest-commit.ts";
import { buildSlugModelArgs } from "../src/model-slug.ts";

function ok(stdout = "", stderr = ""): CommandResult {
	return { code: 0, stdout, stderr };
}

function fail(stderr: string, code = 1): CommandResult {
	return { code, stdout: "", stderr };
}

type UpstreamMode = "contains" | "ahead" | "none" | "failed";

interface PreparationHarnessOptions {
	slug?: string;
	shouldTrunkFail?: boolean;
	currentBranch?: string;
	upstreamMode?: UpstreamMode;
	parentsLine?: string;
	piResult?: CommandResult;
	existingBranches?: Set<string>;
}

function createSnapshot(branch = "feature/base"): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch,
		status: "",
		diff: "",
		clean: true,
	};
}

function createPreparationHarness(options: PreparationHarnessOptions = {}) {
	const calls: Array<{ command: string; args: string[] }> = [];
	const status: string[] = [];
	const upstreamMode = options.upstreamMode ?? "ahead";
	const snapshot = createSnapshot(options.currentBranch ?? "feature/base");
	const existingBranches = options.existingBranches ?? new Set<string>();
	const input = {
		cwd: "/repo",
		args: options.slug === undefined ? {} : { slug: options.slug },
		snapshot,
		setStatus: (message: string | undefined) => {
			if (message !== undefined) {
				status.push(message);
			}
		},
		exec: async (command: string, args: string[]) => {
			calls.push({ command, args });
			if (command === "gt" && args[0] === "trunk") {
				return options.shouldTrunkFail ? fail("gt trunk failed") : ok("master\n");
			}
			if (command === "git" && args[0] === "rev-parse" && args.at(-1) === "@{u}") {
				if (upstreamMode === "none") {
					return fail("fatal: no upstream configured for branch 'feature/base'", 128);
				}
				if (upstreamMode === "failed") {
					return fail("bad upstream state", 128);
				}
				return ok("origin/feature/base\n");
			}
			if (command === "git" && args[0] === "merge-base") {
				return upstreamMode === "contains" ? ok() : { code: 1, stdout: "", stderr: "" };
			}
			if (command === "git" && args[0] === "rev-list") {
				return ok(options.parentsLine ?? "abc123def456 parent987654\n");
			}
			if (command === "git" && args[0] === "log" && args.includes("--format=%B")) {
				return ok("Add latest commit support\n\nBody line\n");
			}
			if (command === "git" && args[0] === "diff") {
				return ok("diff --git a/src/autobranch.ts b/src/autobranch.ts\n+latest commit support\n");
			}
			if (command === "pi") {
				return options.piResult ?? ok("add-latest-commit-autobranch\n");
			}
			if (command === "git" && args[0] === "check-ref-format") {
				return ok();
			}
			if (command === "git" && args[0] === "show-ref") {
				const branch = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
				return existingBranches.has(branch) ? ok() : { code: 1, stdout: "", stderr: "" };
			}
			return ok();
		},
	};
	return { input, calls, status };
}

function piPrompt(calls: Array<{ command: string; args: string[] }>): string {
	const call = calls.find((candidate) => candidate.command === "pi");
	expect(call).toBeDefined();
	expect(call?.args).toContain("--print");
	return call?.args.at(-1) ?? "";
}

function basePlan(overrides: Partial<LatestCommitAutobranchPlan> = {}): LatestCommitAutobranchPlan {
	return {
		sourceBranch: "feature/base",
		trunkBranch: "master",
		originalHeadSha: "abc123def456",
		parentSha: "parent987654",
		commitMessage: "Add latest commit support\n",
		commitDiff: "diff\n",
		commitSummary: "abc123d Add latest commit support",
		branchName: "latest-commit-branch",
		baseSlug: "latest-commit-branch",
		hasSuffix: false,
		slugSource: "requested",
		...overrides,
	};
}

interface TransactionHarnessOptions {
	shouldGtCreateFail?: boolean;
	shouldBranchResetFail?: boolean;
	shouldDeleteBackupFail?: boolean;
	shouldRestoreFail?: boolean;
	verifyHead?: string;
}

function createTransactionHarness(options: TransactionHarnessOptions = {}) {
	const events: string[] = [];
	let currentBranch = "feature/base";
	let head = "abc123def456";
	const input: LatestCommitTransactionInput = {
		cwd: "/repo",
		plan: basePlan(),
		now: () => 123,
		setStatus: (message) => {
			events.push(`status:${message ?? "clear"}`);
		},
		exec: async (command, args) => {
			events.push(`exec:${command} ${args.join(" ")}`);
			if (command === "git" && args[0] === "check-ref-format") {
				return ok();
			}
			if (command === "git" && args[0] === "show-ref") {
				return { code: 1, stdout: "", stderr: "" };
			}
			if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
				return ok(`${currentBranch}\n`);
			}
			if (command === "git" && args[0] === "branch" && args[1] === "-D") {
				const branchName = args[2] ?? "";
				return options.shouldDeleteBackupFail && branchName.startsWith("autobranch-backup/") ? fail("delete failed") : ok("deleted\n");
			}
			if (command === "git" && args[0] === "branch") {
				return ok();
			}
			if (command === "git" && args[0] === "rev-parse") {
				return ok(`${options.verifyHead ?? head}\n`);
			}
			if (command === "git" && args[0] === "reset" && args[1] === "--hard") {
				if (currentBranch === "latest-commit-branch" && args[2] === "abc123def456" && options.shouldBranchResetFail) {
					return fail("branch reset failed");
				}
				head = args[2] ?? head;
				return ok();
			}
			if (command === "gt" && args[0] === "create") {
				if (options.shouldGtCreateFail) {
					return fail("gt create failed");
				}
				currentBranch = args[1] ?? currentBranch;
				return ok("created\n");
			}
			if (command === "git" && args[0] === "checkout") {
				if (options.shouldRestoreFail) {
					return fail("checkout failed");
				}
				currentBranch = args[1] ?? currentBranch;
				return ok();
			}
			return ok();
		},
	};
	return { input, events };
}

function eventIndex(events: string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
}

describe("prepareLatestCommitAutobranchPlan", () => {
	test("explicit slug accepts clean latest commit without model slugging", async () => {
		const harness = createPreparationHarness({ slug: "Latest Commit Branch", upstreamMode: "none" });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan).toMatchObject({
				branchName: "latest-commit-branch",
				baseSlug: "latest-commit-branch",
				slugSource: "requested",
				originalHeadSha: "abc123def456",
				parentSha: "parent987654",
			});
		}
		expect(harness.calls.some((call) => call.command === "pi")).toBe(false);
	});

	test("model slug uses commit message and committed diff", async () => {
		const harness = createPreparationHarness({ upstreamMode: "ahead" });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.branchName).toBe("add-latest-commit-autobranch");
		}
		const prompt = piPrompt(harness.calls);
		expect(harness.calls.find((call) => call.command === "pi")?.args).toEqual(buildSlugModelArgs(prompt));
		expect(prompt).toContain("## commit message\nAdd latest commit support");
		expect(prompt).toContain("## git diff HEAD^ HEAD\ndiff --git");
	});

	test("invalid explicit slug fails before trunk lookup", async () => {
		const harness = createPreparationHarness({ slug: "---", currentBranch: "master" });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "invalid_requested_slug", requestedSlug: "---" });
		expect(harness.calls.some((call) => call.command === "gt" && call.args[0] === "trunk")).toBe(false);
	});

	test("refuses trunk, pushed commits, root commits, and merge commits before branch checks", async () => {
		const trunk = await prepareLatestCommitAutobranchPlan(createPreparationHarness({ currentBranch: "master" }).input);
		expect(trunk).toEqual({ ok: false, kind: "trunk_refusal", branch: "master" });

		const pushed = await prepareLatestCommitAutobranchPlan(createPreparationHarness({ upstreamMode: "contains" }).input);
		expect(pushed).toEqual({ ok: false, kind: "pushed_head_refusal", upstream: "origin/feature/base" });

		const root = await prepareLatestCommitAutobranchPlan(createPreparationHarness({ upstreamMode: "none", parentsLine: "abc123def456\n" }).input);
		expect(root).toEqual({ ok: false, kind: "root_commit_refusal", headSha: "abc123def456" });

		const merge = await prepareLatestCommitAutobranchPlan(createPreparationHarness({ upstreamMode: "none", parentsLine: "abc123def456 p1 p2\n" }).input);
		expect(merge).toEqual({ ok: false, kind: "merge_commit_refusal", headSha: "abc123def456", parentCount: 2 });
	});

	test("model slug failure is fatal in latest-commit mode", async () => {
		const harness = createPreparationHarness({ upstreamMode: "none", piResult: fail("model unavailable") });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.kind).toBe("slug_generation_failed");
			expect("error" in result ? result.error : "").toContain("Rerun with --slug <name>");
		}
	});
});

describe("runLatestCommitAutobranchTransaction", () => {
	test("preserves the original commit SHA and deletes the recovery branch on success", async () => {
		const harness = createTransactionHarness();

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: true, commitSummary: "abc123d Add latest commit support", backupDeleted: true });
		expect(eventIndex(harness.events, "exec:git branch autobranch-backup/feature/base/123 abc123def456")).toBeLessThan(
			eventIndex(harness.events, "exec:git reset --hard parent987654"),
		);
		expect(eventIndex(harness.events, "exec:git reset --hard parent987654")).toBeLessThan(eventIndex(harness.events, "exec:gt create latest-commit-branch"));
		expect(eventIndex(harness.events, "exec:gt create latest-commit-branch")).toBeLessThan(eventIndex(harness.events, "exec:git reset --hard abc123def456"));
		expect(eventIndex(harness.events, "exec:git branch -D autobranch-backup/feature/base/123")).toBeGreaterThan(-1);
	});

	test("backup deletion failure is a success with recovery branch warning data", async () => {
		const harness = createTransactionHarness({ shouldDeleteBackupFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: true,
			commitSummary: "abc123d Add latest commit support",
			backupDeleted: false,
			backupBranch: "autobranch-backup/feature/base/123",
			backupDeleteError: "exit 1: delete failed",
		});
	});

	test("Graphite creation failure restores source and keeps recovery branch", async () => {
		const harness = createTransactionHarness({ shouldGtCreateFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			createError: "exit 1: gt create failed",
			restored: true,
		});
		expect(eventIndex(harness.events, "exec:git checkout feature/base")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create latest-commit-branch"));
		expect(eventIndex(harness.events, "exec:git branch -D autobranch-backup")).toBe(-1);
	});

	test("new branch reset failure restores source and reports partial branch", async () => {
		const harness = createTransactionHarness({ shouldBranchResetFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			branchName: "latest-commit-branch",
			resetError: "exit 1: branch reset failed",
			restored: true,
			createdBranchDeleted: true,
		});
		expect(eventIndex(harness.events, "exec:git checkout feature/base")).toBeGreaterThan(eventIndex(harness.events, "exec:git reset --hard abc123def456"));
		expect(eventIndex(harness.events, "exec:git branch -D latest-commit-branch")).toBeGreaterThan(eventIndex(harness.events, "exec:git checkout feature/base"));
	});
});
