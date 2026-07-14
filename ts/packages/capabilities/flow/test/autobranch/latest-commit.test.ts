import { describe, expect, test } from "vitest";
import {
	eventIndex,
	fail,
	ok,
	type CommandResult,
	createTestAutobranchGitGateway,
	type PendingWorktreeSnapshot,
	type UpstreamMode,
	upstreamAncestryResult,
} from "./autobranch-test-helpers.ts";
import {
	prepareLatestCommitAutobranchPlan,
	runLatestCommitAutobranchTransaction,
	type LatestCommitAutobranchPlan,
	type LatestCommitTransactionInput,
} from "../../src/autobranch/latest-commit.ts";
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";

interface PreparationHarnessOptions {
	slug?: string;
	currentBranch?: string;
	upstreamMode?: UpstreamMode;
	parentsLine?: string;
	piResult?: CommandResult;
	existingBranches?: Set<string>;
	childBranches?: string[];
	shouldChildrenFail?: boolean;
	trunkBranch?: string;
	shouldTrunkFail?: boolean;
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
	const upstreamMode = options.upstreamMode ?? "local-ahead";
	const snapshot = createSnapshot(options.currentBranch ?? "feature/base");
	const upstreamName = `origin/${snapshot.branch}`;
	const existingBranches = options.existingBranches ?? new Set<string>();
	const childBranches = options.childBranches ?? [];
	const exec = async (command: string, args: string[], _timeout: number) => {
		calls.push({ command, args });
		if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
			return ok(`${snapshot.branch}\n`);
		}
		if (command === "git" && args[0] === "for-each-ref") {
			if (args[1] === "--format=%(refname)") {
				return ok();
			}
			return upstreamMode === "none" ? ok() : ok(`${upstreamName}\n`);
		}
		if (command === "git" && args[0] === "merge-base") {
			return upstreamAncestryResult({
				mode: upstreamMode,
				ancestor: args[2] ?? "",
				descendant: args[3] ?? "",
				upstream: upstreamName,
			});
		}
		if (command === "gt" && args[0] === "trunk") {
			return options.shouldTrunkFail
				? fail("gt trunk failed")
				: ok(`${options.trunkBranch ?? "master"}\n`);
		}
		if (command === "gt" && args[0] === "children") {
			return options.shouldChildrenFail ? fail("gt children failed") : ok(childBranches.join("\n"));
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
			return options.piResult ?? ok("add-latest-commit-branch\n");
		}
		if (command === "git" && args[0] === "check-ref-format") {
			return ok();
		}
		if (command === "git" && args[0] === "show-ref") {
			const branch = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
			return existingBranches.has(branch) ? ok() : fail("");
		}
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") {
			const branch = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
			return existingBranches.has(branch) ? ok(`${branch}\n`) : fail("");
		}
		return ok();
	};
	const input = {
		cwd: "/repo",
		args: options.slug === undefined ? {} : { slug: options.slug },
		snapshot,
		exec,
		git: createTestAutobranchGitGateway("/repo", exec),
	};
	return { input, calls };
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
	shouldDeleteCreatedBranchFail?: boolean;
	shouldRestoreFail?: boolean;
	shouldSourceResetFail?: boolean;
	verifyHead?: string;
	existingBranches?: Set<string>;
	upstreamMode?: UpstreamMode;
	sourceBranch?: string;
	trunkBranch?: string;
	shouldTrunkFail?: boolean;
}

function createTransactionHarness(options: TransactionHarnessOptions = {}) {
	const events: string[] = [];
	const sourceBranch = options.sourceBranch ?? "feature/base";
	let currentBranch = sourceBranch;
	let head = "abc123def456";
	const existingBranches = options.existingBranches ?? new Set<string>();
	const upstreamMode = options.upstreamMode ?? "local-ahead";
	const upstreamName = `origin/${sourceBranch}`;
	const exec = async (command: string, args: string[], _timeout: number) => {
		events.push(`exec:${command} ${args.join(" ")}`);
		if (command === "git" && args[0] === "for-each-ref") {
			if (args[1] === "--format=%(refname)") {
				return ok();
			}
			return upstreamMode === "none" ? ok() : ok(`${upstreamName}\n`);
		}
		if (command === "git" && args[0] === "merge-base") {
			return upstreamAncestryResult({
				mode: upstreamMode,
				ancestor: args[2] ?? "",
				descendant: args[3] ?? "",
				upstream: upstreamName,
			});
		}
		if (command === "gt" && args[0] === "trunk") {
			return options.shouldTrunkFail
				? fail("gt trunk failed")
				: ok(`${options.trunkBranch ?? "master"}\n`);
		}
		if (command === "git" && args[0] === "check-ref-format") {
			return ok();
		}
		if (command === "git" && args[0] === "show-ref") {
			const branch = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
			return existingBranches.has(branch) ? ok() : fail("");
		}
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") {
			const branch = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
			return existingBranches.has(branch) ? ok(`${branch}\n`) : fail("");
		}
		if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
			return ok(`${currentBranch}\n`);
		}
		if (command === "git" && args[0] === "branch" && args[1] === "-D") {
			const branchName = args[2] ?? "";
			if (branchName.startsWith("autobranch-backup/")) {
				return options.shouldDeleteBackupFail ? fail("delete failed") : ok("deleted\n");
			}
			return options.shouldDeleteCreatedBranchFail
				? fail("delete created failed")
				: ok("deleted\n");
		}
		if (command === "git" && args[0] === "branch") {
			return ok();
		}
		if (command === "git" && args[0] === "rev-parse") {
			return ok(`${options.verifyHead ?? head}\n`);
		}
		if (command === "git" && args[0] === "reset" && args[1] === "--hard") {
			if (
				currentBranch === sourceBranch &&
				args[2] === "parent987654" &&
				options.shouldSourceResetFail
			) {
				return fail("source reset failed");
			}
			if (
				currentBranch === "latest-commit-branch" &&
				args[2] === "abc123def456" &&
				options.shouldBranchResetFail
			) {
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
	};
	const input: LatestCommitTransactionInput = {
		cwd: "/repo",
		plan: basePlan({ sourceBranch }),
		now: () => 123,
		exec,
		git: createTestAutobranchGitGateway("/repo", exec),
	};
	return { input, events };
}

function occupiedBackupBranches(): Set<string> {
	const base = "autobranch-backup/feature/base/123";
	return new Set(
		Array.from({ length: 50 }, (_, index) => `${base}${index === 0 ? "" : `-${index + 1}`}`),
	);
}

describe("prepareLatestCommitAutobranchPlan", () => {
	test("explicit slug accepts clean latest commit without model slugging", async () => {
		const harness = createPreparationHarness({
			slug: "Latest Commit Branch",
			upstreamMode: "none",
		});

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
		const harness = createPreparationHarness({ upstreamMode: "local-ahead" });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.branchName).toBe("add-latest-commit-branch");
		}
		const prompt = piPrompt(harness.calls);
		expect(harness.calls.find((call) => call.command === "pi")?.args).toEqual(
			buildRawTextModelArgs(prompt),
		);
		expect(prompt).toContain("## commit message\nAdd latest commit support");
		expect(prompt).toContain("## git diff HEAD^ HEAD\ndiff --git");
	});

	test("invalid explicit slug fails before reading commit evidence", async () => {
		const harness = createPreparationHarness({ slug: "---", currentBranch: "master" });

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "invalid_requested_slug", requestedSlug: "---" });
		expect(
			harness.calls.some((call) => call.command === "git" && call.args[0] === "rev-list"),
		).toBe(false);
	});

	test("keeps no-upstream and local-ahead trunk commits eligible without trunk lookup", async () => {
		for (const upstreamMode of ["none", "local-ahead"] as const) {
			const harness = createPreparationHarness({
				currentBranch: "master",
				upstreamMode,
			});

			const result = await prepareLatestCommitAutobranchPlan(harness.input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.plan.sourceBranch).toBe("master");
			}
			expect(harness.calls.some((call) => call.command === "gt" && call.args[0] === "trunk")).toBe(
				false,
			);
		}
	});

	test("accepts a synchronized non-trunk branch after bidirectional ancestry checks", async () => {
		const harness = createPreparationHarness({
			slug: "latest-commit-branch",
			upstreamMode: "synchronized",
			trunkBranch: "master",
		});

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan).not.toHaveProperty("upstream");
		}
		expect(harness.calls).toEqual(
			expect.arrayContaining([
				{
					command: "git",
					args: ["merge-base", "--is-ancestor", "HEAD", "origin/feature/base"],
				},
				{
					command: "git",
					args: ["merge-base", "--is-ancestor", "origin/feature/base", "HEAD"],
				},
				{ command: "gt", args: ["trunk", "--no-interactive"] },
			]),
		);
	});

	test("refuses remote-ahead and diverged branches before Graphite child inspection", async () => {
		for (const [upstreamMode, kind] of [
			["remote-ahead", "remote_ahead_refusal"],
			["diverged", "diverged_upstream_refusal"],
		] as const) {
			const harness = createPreparationHarness({ upstreamMode });

			const result = await prepareLatestCommitAutobranchPlan(harness.input);

			expect(result).toEqual({
				ok: false,
				kind,
				upstream: "origin/feature/base",
			});
			expect(
				harness.calls.some((call) => call.command === "gt" && call.args[0] === "children"),
			).toBe(false);
			expect(
				harness.calls.some((call) => call.command === "git" && call.args[0] === "rev-list"),
			).toBe(false);
			expect(harness.calls.some((call) => call.command === "gt" && call.args[0] === "trunk")).toBe(
				false,
			);
		}
	});

	test("refuses synchronized trunk and treats relationship or trunk probes as failures", async () => {
		const trunk = await prepareLatestCommitAutobranchPlan(
			createPreparationHarness({
				currentBranch: "master",
				upstreamMode: "synchronized",
				trunkBranch: "master",
			}).input,
		);
		expect(trunk).toEqual({
			ok: false,
			kind: "synchronized_trunk_refusal",
			branch: "master",
			upstream: "origin/master",
			trunk: "master",
		});

		const upstreamFailed = await prepareLatestCommitAutobranchPlan(
			createPreparationHarness({ upstreamMode: "failed" }).input,
		);
		expect(upstreamFailed).toEqual({
			ok: false,
			kind: "upstream_check_failed",
			error:
				"git merge-base --is-ancestor HEAD origin/feature/base failed.\nexit code 128: bad upstream relationship",
		});

		const trunkFailed = await prepareLatestCommitAutobranchPlan(
			createPreparationHarness({
				upstreamMode: "synchronized",
				shouldTrunkFail: true,
			}).input,
		);
		expect(trunkFailed).toEqual({
			ok: false,
			kind: "graphite_trunk_check_failed",
			error: "exit code 1: gt trunk failed",
		});
	});

	test("refuses root and merge commits before branch-name checks", async () => {
		const root = await prepareLatestCommitAutobranchPlan(
			createPreparationHarness({ upstreamMode: "none", parentsLine: "abc123def456\n" }).input,
		);
		expect(root).toEqual({ ok: false, kind: "root_commit_refusal", headSha: "abc123def456" });

		const merge = await prepareLatestCommitAutobranchPlan(
			createPreparationHarness({ upstreamMode: "none", parentsLine: "abc123def456 p1 p2\n" }).input,
		);
		expect(merge).toEqual({
			ok: false,
			kind: "merge_commit_refusal",
			headSha: "abc123def456",
			parentCount: 2,
		});
	});

	test("refuses source branches with Graphite children before reading commit evidence", async () => {
		const harness = createPreparationHarness({
			upstreamMode: "none",
			childBranches: ["feature/child"],
		});

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "child_branch_refusal",
			children: ["feature/child"],
		});
		expect(
			harness.calls.some((call) => call.command === "git" && call.args[0] === "rev-list"),
		).toBe(false);
	});

	test("model slug failure is fatal in latest-commit mode", async () => {
		const harness = createPreparationHarness({
			upstreamMode: "none",
			piResult: fail("model unavailable"),
		});

		const result = await prepareLatestCommitAutobranchPlan(harness.input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.kind).toBe("slug_generation_failed");
			expect("error" in result ? result.error : "").toContain("Rerun with --slug <name>");
		}
	});
});

describe("runLatestCommitAutobranchTransaction", () => {
	test("rechecks remote-ahead and diverged relationships before mutation", async () => {
		for (const [upstreamMode, kind] of [
			["remote-ahead", "remote_ahead_refusal"],
			["diverged", "diverged_upstream_refusal"],
		] as const) {
			const harness = createTransactionHarness({ upstreamMode });

			const result = await runLatestCommitAutobranchTransaction(harness.input);

			expect(result).toEqual({
				ok: false,
				kind,
				upstream: "origin/feature/base",
			});
			expect(eventIndex(harness.events, "exec:git branch autobranch-backup/")).toBe(-1);
			expect(eventIndex(harness.events, "exec:git reset --hard")).toBe(-1);
			expect(eventIndex(harness.events, "exec:gt create")).toBe(-1);
		}
	});

	test("rechecks synchronized trunk and probe failures before mutation", async () => {
		const trunk = createTransactionHarness({
			sourceBranch: "master",
			upstreamMode: "synchronized",
			trunkBranch: "master",
		});
		expect(await runLatestCommitAutobranchTransaction(trunk.input)).toEqual({
			ok: false,
			kind: "synchronized_trunk_refusal",
			branch: "master",
			upstream: "origin/master",
			trunk: "master",
		});

		const upstreamFailed = createTransactionHarness({ upstreamMode: "failed" });
		expect(await runLatestCommitAutobranchTransaction(upstreamFailed.input)).toEqual({
			ok: false,
			kind: "transaction_upstream_check_failed",
			error:
				"git merge-base --is-ancestor HEAD origin/feature/base failed.\nexit code 128: bad upstream relationship",
		});

		const trunkFailed = createTransactionHarness({
			upstreamMode: "synchronized",
			shouldTrunkFail: true,
		});
		expect(await runLatestCommitAutobranchTransaction(trunkFailed.input)).toEqual({
			ok: false,
			kind: "transaction_graphite_trunk_check_failed",
			error: "exit code 1: gt trunk failed",
		});

		for (const harness of [trunk, upstreamFailed, trunkFailed]) {
			expect(eventIndex(harness.events, "exec:git branch autobranch-backup/")).toBe(-1);
			expect(eventIndex(harness.events, "exec:git reset --hard")).toBe(-1);
			expect(eventIndex(harness.events, "exec:gt create")).toBe(-1);
		}
	});

	test("records synchronized upstream context after a successful non-trunk transaction", async () => {
		const harness = createTransactionHarness({
			upstreamMode: "synchronized",
			trunkBranch: "master",
		});

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: true,
			commitSummary: "abc123d Add latest commit support",
			backupDeleted: true,
			synchronizedUpstream: {
				name: "origin/feature/base",
				originalHeadSha: "abc123def456",
			},
		});
	});

	test("keeps no-upstream and local-ahead trunk transactions independent of trunk lookup", async () => {
		for (const upstreamMode of ["none", "local-ahead"] as const) {
			const harness = createTransactionHarness({ sourceBranch: "master", upstreamMode });

			const result = await runLatestCommitAutobranchTransaction(harness.input);

			expect(result.ok).toBe(true);
			expect(eventIndex(harness.events, "exec:gt trunk --no-interactive")).toBe(-1);
		}
	});

	test("backup branch name exhaustion fails before mutation", async () => {
		const harness = createTransactionHarness({ existingBranches: occupiedBackupBranches() });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "backup_branch_name_unavailable",
			sourceBranch: "feature/base",
		});
		expect(
			harness.events.some((event) => event.startsWith("exec:git branch autobranch-backup/")),
		).toBe(false);
		expect(eventIndex(harness.events, "exec:git reset --hard")).toBe(-1);
		expect(eventIndex(harness.events, "exec:gt create")).toBe(-1);
	});

	test("preserves the original commit SHA and deletes the recovery branch on success", async () => {
		const harness = createTransactionHarness();

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: true,
			commitSummary: "abc123d Add latest commit support",
			backupDeleted: true,
		});
		expect(
			eventIndex(harness.events, "exec:git branch autobranch-backup/feature/base/123 abc123def456"),
		).toBeLessThan(eventIndex(harness.events, "exec:git reset --hard parent987654"));
		expect(eventIndex(harness.events, "exec:git reset --hard parent987654")).toBeLessThan(
			eventIndex(harness.events, "exec:gt create latest-commit-branch"),
		);
		expect(eventIndex(harness.events, "exec:gt create latest-commit-branch")).toBeLessThan(
			eventIndex(harness.events, "exec:git reset --hard abc123def456"),
		);
		expect(
			eventIndex(harness.events, "exec:git branch -D autobranch-backup/feature/base/123"),
		).toBeGreaterThan(-1);
	});

	test("backup deletion failure is a success with recovery branch warning data", async () => {
		const harness = createTransactionHarness({ shouldDeleteBackupFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: true,
			commitSummary: "abc123d Add latest commit support",
			backupDeleted: false,
			backupBranch: "autobranch-backup/feature/base/123",
			backupDeleteError: "exit code 1: delete failed",
		});
	});

	test("normalizes recovery branch source segments", async () => {
		const longSegment = "A".repeat(40);
		const harness = createTransactionHarness({
			sourceBranch: `Féature/fix-plan/###/UPPER punctuation!!!/${longSegment}`,
		});

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: true,
			commitSummary: "abc123d Add latest commit support",
			backupDeleted: true,
		});
		expect(
			eventIndex(
				harness.events,
				`exec:git branch autobranch-backup/feature/fix/upper-punctuation/${"a".repeat(32)}/123 abc123def456`,
			),
		).toBeGreaterThan(-1);
	});

	test("source reset failure deletes redundant backup when source is unchanged", async () => {
		const harness = createTransactionHarness({ shouldSourceResetFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "source_reset_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			error: "exit code 1: source reset failed",
			backupCleanup: "deleted",
		});
		expect(
			eventIndex(harness.events, "exec:git branch -D autobranch-backup/feature/base/123"),
		).toBeGreaterThan(eventIndex(harness.events, "exec:git reset --hard parent987654"));
		expect(eventIndex(harness.events, "exec:gt create")).toBe(-1);
	});

	test("source reset failure gives recovery command when source diverged", async () => {
		const harness = createTransactionHarness({ verifyHead: "def456abc789" });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "source_reset_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			error: "Expected HEAD abc123def456, but found def456abc789.",
			backupCleanup: "recovery_required",
			recoveryCommand:
				"git checkout feature/base && git reset --hard autobranch-backup/feature/base/123",
		});
		expect(
			eventIndex(harness.events, "exec:git branch -D autobranch-backup/feature/base/123"),
		).toBe(-1);
		expect(eventIndex(harness.events, "exec:gt create")).toBe(-1);
	});

	test("Graphite creation failure restores source and deletes a partial created branch", async () => {
		const harness = createTransactionHarness({ shouldGtCreateFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			branchName: "latest-commit-branch",
			createError: "exit code 1: gt create failed",
			restored: true,
			createdBranchDeleted: true,
		});
		expect(eventIndex(harness.events, "exec:git checkout feature/base")).toBeGreaterThan(
			eventIndex(harness.events, "exec:gt create latest-commit-branch"),
		);
		expect(eventIndex(harness.events, "exec:git branch -D latest-commit-branch")).toBeGreaterThan(
			eventIndex(harness.events, "exec:git checkout feature/base"),
		);
		expect(eventIndex(harness.events, "exec:git branch -D autobranch-backup")).toBe(-1);
	});

	test("Graphite creation failure reports partial branch deletion failure", async () => {
		const harness = createTransactionHarness({
			shouldGtCreateFail: true,
			shouldDeleteCreatedBranchFail: true,
		});

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			branchName: "latest-commit-branch",
			createError: "exit code 1: gt create failed",
			restored: true,
			createdBranchDeleted: false,
			createdBranchDeleteError: "exit code 1: delete created failed",
		});
	});

	test("new branch reset failure restores source and reports partial branch", async () => {
		const harness = createTransactionHarness({ shouldBranchResetFail: true });

		const result = await runLatestCommitAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: "autobranch-backup/feature/base/123",
			branchName: "latest-commit-branch",
			resetError: "exit code 1: branch reset failed",
			restored: true,
			createdBranchDeleted: true,
		});
		expect(eventIndex(harness.events, "exec:git checkout feature/base")).toBeGreaterThan(
			eventIndex(harness.events, "exec:git reset --hard abc123def456"),
		);
		expect(eventIndex(harness.events, "exec:git branch -D latest-commit-branch")).toBeGreaterThan(
			eventIndex(harness.events, "exec:git checkout feature/base"),
		);
	});
});
