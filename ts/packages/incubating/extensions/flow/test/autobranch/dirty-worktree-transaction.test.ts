import { describe, expect, test } from "vitest";
import {
	runAutobranchTransaction,
	type AutobranchTransactionInput,
} from "../../src/autobranch/dirty-worktree.ts";
import { createTestAutobranchGitGateway, eventIndex, fail, ok } from "./autobranch-test-helpers.ts";
import type { AutobranchProviderGateway } from "../../src/autobranch/provider.ts";

interface HarnessOptions {
	shouldStashPushFail?: boolean;
	isStashRefMissing?: boolean;
	shouldGtCreateFail?: boolean;
	shouldStashPopFail?: boolean;
	shouldHeadShaFail?: boolean;
	sourceBranch?: string;
	commitResult?: { summary: string } | { error: string };
}

function createHarness(options: HarnessOptions = {}) {
	const events: string[] = [];
	let stashMessage = "";
	let providerAddAttempted = false;
	const commitResult = options.commitResult ?? { summary: "abc123 [cp] Update checkpoint tests" };
	const exec = async (command: string, args: string[], _timeout: number) => {
		events.push(`exec:${command} ${args.join(" ")}`);
		if (command === "git" && args.join(" ") === "rev-parse HEAD") {
			return options.shouldHeadShaFail ? fail("head probe failed", 128) : ok("abc123\n");
		}
		if (command === "git" && args.join(" ") === "branch --show-current") {
			const childCreated = providerAddAttempted || events.includes("provider:add");
			return ok(`${childCreated ? "test-branch" : (options.sourceBranch ?? "base-branch")}\n`);
		}
		if (
			command === "git" &&
			args.join(" ") === "show-ref --verify --quiet refs/heads/test-branch"
		) {
			return providerAddAttempted || events.includes("provider:add") ? ok() : fail("", 1);
		}
		if (
			command === "git" &&
			(args.join(" ") === "rev-parse --verify refs/heads/test-branch" ||
				args.join(" ") === "rev-parse --verify refs/heads/base-branch" ||
				args.join(" ") === "rev-parse --verify refs/heads/feature/source")
		) {
			return ok("abc123\n");
		}
		if (command === "git" && args[0] === "stash" && args[1] === "push") {
			stashMessage = args.at(-1) ?? "";
			return options.shouldStashPushFail
				? fail("stash push failed")
				: ok("Saved working directory\n");
		}
		if (command === "git" && args[0] === "stash" && args[1] === "list") {
			return options.isStashRefMissing
				? ok("stash@{0}\0On base-branch: unrelated stash\n")
				: ok(`stash@{0}\0On base-branch: ${stashMessage}\n`);
		}
		if (command === "git" && args[0] === "stash" && args[1] === "pop") {
			return options.shouldStashPopFail ? fail("stash conflict") : ok("restored\n");
		}
		if (command === "gt" && args[0] === "create") {
			providerAddAttempted = true;
			return options.shouldGtCreateFail ? fail("gt create failed") : ok("created\n");
		}
		return ok();
	};
	const input: AutobranchTransactionInput = {
		cwd: "/repo",
		sourceBranch: "base-branch",
		branchName: "test-branch",
		checkpointMessage: "[cp] Update checkpoint tests\n\n- Add coverage",
		now: () => 123,
		exec,
		git: createTestAutobranchGitGateway("/repo", exec),
		commitPreparedCheckpointMessage: async (message) => {
			events.push(`commit:${message}`);
			return commitResult;
		},
	};
	return { input, events };
}

describe("runAutobranchTransaction", () => {
	test("success returns the checkpoint commit summary", async () => {
		const harness = createHarness();

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: true, commitSummary: "abc123 [cp] Update checkpoint tests" });
		expect(eventIndex(harness.events, "exec:git stash push")).toBeLessThan(
			eventIndex(harness.events, "exec:git stash list"),
		);
		expect(eventIndex(harness.events, "exec:git stash list")).toBeLessThan(
			eventIndex(harness.events, "exec:gt create"),
		);
		expect(eventIndex(harness.events, "exec:gt create")).toBeLessThan(
			eventIndex(harness.events, "exec:git stash pop"),
		);
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeLessThan(
			eventIndex(harness.events, "commit:"),
		);
	});

	test("stash failure returns stash_failed and does not call Graphite", async () => {
		const harness = createHarness({ shouldStashPushFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "stash_failed",
			error: "exit code 1: stash push failed",
		});
		expect(harness.events.some((event) => event.startsWith("exec:gt create"))).toBe(false);
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("missing stash ref returns stash_ref_missing and does not call Graphite", async () => {
		const harness = createHarness({ isStashRefMissing: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "stash_ref_missing",
			stashMessage: "pi-autobranch:123:test-branch",
			error: "No matching stash entry found.",
		});
		expect(harness.events.some((event) => event.startsWith("exec:gt create"))).toBe(false);
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("Graphite failure restores the stash and returns restored true", async () => {
		const harness = createHarness({ shouldGtCreateFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			createError: "exit code 1: gt create failed",
			restored: true,
		});
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(
			eventIndex(harness.events, "exec:gt create"),
		);
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("Graphite failure plus restore failure returns restored false", async () => {
		const harness = createHarness({ shouldGtCreateFail: true, shouldStashPopFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			createError: "exit code 1: gt create failed",
			restored: false,
			restoreError: "exit code 1: stash conflict",
		});
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("restore failure after branch creation does not commit", async () => {
		const harness = createHarness({ shouldStashPopFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toMatchObject({
			ok: false,
			kind: "restore_failed_after_branch_create",
			restoreError: "exit code 1: stash conflict",
			recovery: {
				stashRef: "stash@{0}",
				stashState: "retained",
				provider: "graphite",
				initialized: false,
			},
		});
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(
			eventIndex(harness.events, "exec:gt create"),
		);
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("gh-stack tracked dirty success preserves stash, add, restore, and commit order", async () => {
		const harness = createHarness();
		const provider = fakeGhStackProvider(harness.events);

		const result = await runAutobranchTransaction({
			...harness.input,
			sourceBranch: "feature/source",
			provider,
		});

		expect(result).toEqual({ ok: true, commitSummary: "abc123 [cp] Update checkpoint tests" });
		expect(eventIndex(harness.events, "exec:git stash push")).toBeLessThan(
			eventIndex(harness.events, "provider:add"),
		);
		expect(eventIndex(harness.events, "provider:add")).toBeLessThan(
			eventIndex(harness.events, "exec:git stash pop"),
		);
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeLessThan(
			eventIndex(harness.events, "commit:"),
		);
	});

	test("gh-stack initialization failure does not pop when the safe branch is ambiguous", async () => {
		const harness = createHarness();
		const provider = fakeGhStackProvider(harness.events, {
			prepare: { type: "failed", error: "init failed", initialized: false },
		});

		const result = await runAutobranchTransaction({
			...harness.input,
			sourceBranch: "feature/source",
			provider,
		});

		expect(result).toEqual({
			ok: false,
			kind: "provider_prepare_failed",
			error: "init failed",
			initialized: false,
			restored: false,
			restoreError: expect.stringContaining("safe destination could not be proven"),
			recovery: {
				stashRef: "stash@{0}",
				stashState: "retained",
				current: { type: "branch", name: "base-branch" },
				sourceBranch: "feature/source",
				expectedSourceSha: "abc123",
				childBranch: "test-branch",
				expectedChildSha: "abc123",
				provider: "gh-stack",
				initialized: false,
				providerOutcome: "prepare-failed",
			},
		});
		expect(eventIndex(harness.events, "exec:git stash pop")).toBe(-1);
		expect(eventIndex(harness.events, "provider:add")).toBe(-1);
	});

	test("gh-stack head probe failure after retained initialization restores the exact stash to the proven source", async () => {
		const harness = createHarness({
			shouldHeadShaFail: true,
			sourceBranch: "feature/source",
		});
		const provider = fakeGhStackProvider(harness.events, {
			prepare: { type: "ready", initialized: true },
		});

		const result = await runAutobranchTransaction({
			...harness.input,
			sourceBranch: "feature/source",
			provider,
		});

		expect(result).toMatchObject({
			ok: false,
			kind: "provider_prepare_failed",
			initialized: true,
			restored: true,
			recovery: {
				stashRef: "stash@{0}",
				stashState: "applied",
				current: { type: "branch", name: "feature/source" },
				sourceBranch: "feature/source",
				expectedSourceSha: "abc123",
				childBranch: "test-branch",
				expectedChildSha: "abc123",
				provider: "gh-stack",
				initialized: true,
				providerOutcome: "prepare-failed",
			},
		});
		expect(eventIndex(harness.events, "exec:git stash pop stash@{0}")).toBeGreaterThan(
			eventIndex(harness.events, "provider:prepare"),
		);
		expect(eventIndex(harness.events, "provider:add")).toBe(-1);
	});

	test("gh-stack retained initialization and ambiguous add are reported without deleting the child", async () => {
		const harness = createHarness();
		const provider = fakeGhStackProvider(harness.events, {
			prepare: { type: "ready", initialized: true },
			add: {
				type: "ambiguous",
				error: "add may have adopted child",
				initialized: true,
				observedChild: true,
			},
		});

		const result = await runAutobranchTransaction({
			...harness.input,
			sourceBranch: "feature/source",
			provider,
		});

		expect(result).toMatchObject({
			ok: false,
			kind: "provider_add_failed",
			initialized: true,
			mutation: "ambiguous",
			restored: true,
		});
		expect(harness.events.some((event) => event.includes("branch -D"))).toBe(false);
	});

	test("commit failure returns commit_failed_after_branch_create", async () => {
		const harness = createHarness({ commitResult: { error: "commit failed" } });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toMatchObject({
			ok: false,
			kind: "commit_failed_after_branch_create",
			commitError: "commit failed",
			recovery: {
				stashRef: "stash@{0}",
				stashState: "applied",
				provider: "graphite",
				initialized: false,
			},
		});
		expect(eventIndex(harness.events, "commit:")).toBeGreaterThan(
			eventIndex(harness.events, "exec:git stash pop"),
		);
	});
});

function fakeGhStackProvider(
	events: string[],
	options: {
		prepare?: Awaited<ReturnType<AutobranchProviderGateway["prepareSource"]>>;
		add?: Awaited<ReturnType<AutobranchProviderGateway["addChild"]>>;
	} = {},
): AutobranchProviderGateway {
	return {
		id: "gh-stack",
		async inspectSource(sourceBranch) {
			return {
				type: "tracked",
				topology: {
					provider: "gh-stack",
					trunk: "main",
					currentBranch: sourceBranch,
					branches: [sourceBranch],
					children: [],
					edges: [],
				},
			};
		},
		async preflightSource() {
			events.push("provider:preflight");
			return { type: "ready", initialized: false };
		},
		async prepareSource() {
			events.push("provider:prepare");
			return options.prepare ?? { type: "ready", initialized: false };
		},
		async addChild() {
			events.push("provider:add");
			return options.add ?? { type: "verified", initialized: false };
		},
	};
}
