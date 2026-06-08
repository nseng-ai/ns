import { describe, expect, test } from "vitest";
import { runAutobranchTransaction, type AutobranchTransactionInput } from "../src/autobranch/transaction.ts";
import { eventIndex, fail, ok } from "./autobranch-test-helpers.ts";

interface HarnessOptions {
	shouldStashPushFail?: boolean;
	isStashRefMissing?: boolean;
	shouldGtCreateFail?: boolean;
	shouldStashPopFail?: boolean;
	commitResult?: { summary: string } | { error: string };
}

function createHarness(options: HarnessOptions = {}) {
	const events: string[] = [];
	let stashMessage = "";
	const commitResult = options.commitResult ?? { summary: "abc123 [cp] Update checkpoint tests" };
	const input: AutobranchTransactionInput = {
		cwd: "/repo",
		branchName: "test-branch",
		checkpointMessage: "[cp] Update checkpoint tests\n\n- Add coverage",
		now: () => 123,
		exec: async (command, args) => {
			events.push(`exec:${command} ${args.join(" ")}`);
			if (command === "git" && args[0] === "stash" && args[1] === "push") {
				stashMessage = args.at(-1) ?? "";
				return options.shouldStashPushFail ? fail("stash push failed") : ok("Saved working directory\n");
			}
			if (command === "git" && args[0] === "stash" && args[1] === "list") {
				return options.isStashRefMissing ? ok("stash@{0}\0On base-branch: unrelated stash\n") : ok(`stash@{0}\0On base-branch: ${stashMessage}\n`);
			}
			if (command === "git" && args[0] === "stash" && args[1] === "pop") {
				return options.shouldStashPopFail ? fail("stash conflict") : ok("restored\n");
			}
			if (command === "gt" && args[0] === "create") {
				return options.shouldGtCreateFail ? fail("gt create failed") : ok("created\n");
			}
			return ok();
		},
		commitPreparedCheckpointMessage: async (message) => {
			events.push(`commit:${message}`);
			return commitResult;
		},
		setStatus: (message) => {
			events.push(`status:${message ?? "clear"}`);
		},
	};
	return { input, events };
}

describe("runAutobranchTransaction", () => {
	test("success returns the checkpoint commit summary", async () => {
		const harness = createHarness();

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: true, commitSummary: "abc123 [cp] Update checkpoint tests" });
		expect(eventIndex(harness.events, "exec:git stash push")).toBeLessThan(eventIndex(harness.events, "exec:git stash list"));
		expect(eventIndex(harness.events, "exec:git stash list")).toBeLessThan(eventIndex(harness.events, "exec:gt create"));
		expect(eventIndex(harness.events, "exec:gt create")).toBeLessThan(eventIndex(harness.events, "exec:git stash pop"));
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeLessThan(eventIndex(harness.events, "commit:"));
	});

	test("stash failure returns stash_failed and does not call Graphite", async () => {
		const harness = createHarness({ shouldStashPushFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: false, kind: "stash_failed", error: "exit 1: stash push failed" });
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

		expect(result).toEqual({ ok: false, kind: "graphite_create_failed", createError: "exit 1: gt create failed", restored: true });
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create"));
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("Graphite failure plus restore failure returns restored false", async () => {
		const harness = createHarness({ shouldGtCreateFail: true, shouldStashPopFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({
			ok: false,
			kind: "graphite_create_failed",
			createError: "exit 1: gt create failed",
			restored: false,
			restoreError: "exit 1: stash conflict",
		});
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("restore failure after branch creation does not commit", async () => {
		const harness = createHarness({ shouldStashPopFail: true });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: false, kind: "restore_failed_after_branch_create", restoreError: "exit 1: stash conflict" });
		expect(eventIndex(harness.events, "exec:git stash pop")).toBeGreaterThan(eventIndex(harness.events, "exec:gt create"));
		expect(harness.events.some((event) => event.startsWith("commit:"))).toBe(false);
	});

	test("commit failure returns commit_failed_after_branch_create", async () => {
		const harness = createHarness({ commitResult: { error: "commit failed" } });

		const result = await runAutobranchTransaction(harness.input);

		expect(result).toEqual({ ok: false, kind: "commit_failed_after_branch_create", commitError: "commit failed" });
		expect(eventIndex(harness.events, "commit:")).toBeGreaterThan(eventIndex(harness.events, "exec:git stash pop"));
	});
});
