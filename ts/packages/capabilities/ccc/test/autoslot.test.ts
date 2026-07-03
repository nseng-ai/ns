import { describe, expect, test } from "vitest";
import type { Caps } from "@ji/clinkr";
import { stripAnsi } from "@ji/clinkr/testing";
import type { AutoslotCliInput, AutoslotFlowInput } from "../src/ji/autoslot.ts";
import { createAutoslotFlow, runAutoslotCli } from "../src/ji/autoslot.ts";
import { fail, ok, type CommandResult } from "./autobranch-test-helpers.ts";

// Mono caps keep durable-outcome assertions readable: no color SGR, glyph still present. The
// house-style/caps-degradation ladder is verified directly in `autoslot-presentation.test.ts`.
const TEST_CAPS: Caps = {
	isTty: false,
	colorDepth: "none",
	columns: 80,
	canRenderUnicode: true,
};

interface HarnessOptions {
	mode?: "dirty" | "latest_commit";
	prepareResult?: { ok: true; message: string } | { ok: false; error: string };
	isDirtyAfterAutobranch?: boolean;
	slotFailure?: string;
}

function createHarness(options: HarnessOptions = {}) {
	const mode = options.mode ?? "dirty";
	const events: string[] = [];
	const notifications: Array<{ message: string; level: string }> = [];
	const statuses: Array<string | undefined> = [];
	const prepareResult = options.prepareResult ?? {
		ok: true,
		message: "[cp] Update autoslot tests\n\n- Add coverage",
	};
	let statusCalls = 0;
	let head = "abc123def456";
	let currentBranch = "source-branch";

	const exec = async (command: string, args: string[]): Promise<CommandResult> => {
		events.push(`exec:${command} ${args.join(" ")}`);
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel")
			return ok("/repo\n");
		if (command === "git" && args[0] === "symbolic-ref") return ok("source-branch\n");
		if (command === "git" && args[0] === "status") {
			statusCalls += 1;
			if (statusCalls === 1) return ok(mode === "latest_commit" ? "" : " M file.ts\n");
			return ok(options.isDirtyAfterAutobranch ? " M file.ts\n" : "");
		}
		if (command === "git" && args[0] === "diff" && args[1] === "HEAD^")
			return ok("diff --git a/file.ts b/file.ts\n+committed\n");
		if (command === "git" && args[0] === "diff") return ok("diff --git a/file.ts b/file.ts\n");
		if (command === "git" && args[0] === "ls-files") return ok("");
		if (command === "git" && args[0] === "check-ref-format") return ok();
		if (command === "git" && args[0] === "show-ref") return fail("not found");
		if (command === "git" && args[0] === "stash" && args[1] === "push")
			return ok("Saved working directory\n");
		if (command === "git" && args[0] === "stash" && args[1] === "list")
			return ok("stash@{0}\0On source-branch: pi-autobranch:123:test-branch\n");
		if (command === "git" && args[0] === "stash" && args[1] === "pop") return ok("restored\n");
		if (command === "git" && args[0] === "branch" && args[1] === "--show-current")
			return ok(`${currentBranch}\n`);
		if (command === "git" && args[0] === "for-each-ref") return ok("");
		if (command === "git" && args[0] === "rev-list") return ok("abc123def456 parent987654\n");
		if (command === "git" && args[0] === "log") return ok("Update committed feature\n");
		if (command === "git" && args[0] === "branch" && args[1] !== "-D") return ok();
		if (command === "git" && args[0] === "branch" && args[1] === "-D") return ok("deleted\n");
		if (command === "git" && args[0] === "reset" && args[1] === "--hard") {
			head = args[2] ?? head;
			return ok(`HEAD is now at ${head}\n`);
		}
		if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return ok(`${head}\n`);
		if (command === "git" && args[0] === "checkout") {
			currentBranch = args[1] ?? currentBranch;
			return ok();
		}
		if (command === "gt" && args[0] === "trunk") return ok("master\n");
		if (command === "gt" && args[0] === "children") return ok("");
		if (command === "gt" && args[0] === "create") {
			currentBranch = args[1] ?? currentBranch;
			return ok("created\n");
		}
		throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
	};

	const input: AutoslotFlowInput = {
		cwd: "/repo",
		args: { slug: "test-branch" },
		caps: TEST_CAPS,
		now: () => 123,
		exec: (command, args) => exec(command, args),
		slotClient: {
			async checkoutCurrent() {
				events.push("slot-client:current");
				if (options.slotFailure !== undefined) {
					return {
						ok: false as const,
						failure: { errorType: "slot-failure", message: options.slotFailure },
					};
				}
				return {
					ok: true as const,
					target: {
						slotName: "slot-01",
						branchName: "test-branch",
						worktreePath: "/slots/slot-01",
						isAlreadyAssigned: false,
						hasCreatedBranch: false,
						currentWorktreeNote: null,
					},
				};
			},
			async checkoutBranch(options: { branchName: string }) {
				events.push(`slot-client:branch ${options.branchName}`);
				return {
					ok: false as const,
					failure: {
						errorType: "unexpected-branch-checkout",
						message: "Unexpected branch ji slot checkout in autoslot test.",
					},
				};
			},
		},
		prepareCheckpointMessage: async () => {
			events.push("prepare");
			return prepareResult;
		},
		commitPreparedCheckpointMessage: async () => {
			events.push("commit");
			return { summary: "abc123 [cp] Update autoslot tests" };
		},
		io: {
			phase: (message) => statuses.push(message),
			notify: (message, level) => notifications.push({ message, level: level ?? "info" }),
			message: () => {},
			clearPhase: () => statuses.push(undefined),
		},
	};

	return { input, events, notifications, statuses };
}

describe("autoslot flow", () => {
	test("successful dirty autoslot runs ji slot checkout current", async () => {
		const harness = createHarness();

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("commit");
		expect(harness.events).toContain("slot-client:current");
		expect(harness.statuses).toEqual([
			"Inspecting worktree…",
			"Drafting checkpoint message…",
			"Creating Graphite branch and checkpoint…",
			"Checking out branch slot…",
		]);
		const success = harness.notifications.at(-1);
		expect(success?.level).toBe("info");
		const successText = stripAnsi(success?.message ?? "");
		expect(successText).toContain("Autoslot moved test-branch to slot-01.");
		expect(successText).toContain("Worktree: /slots/slot-01");
		// The navigation line stays visible and copyable.
		expect(successText).toContain("ji slot co test-branch");
		expect(successText).toContain("Cwd: /repo");
	});

	test("successful latest-commit autoslot runs ji slot checkout current", async () => {
		const harness = createHarness({ mode: "latest_commit" });

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("exec:git reset --hard parent987654");
		expect(harness.events).toContain("exec:gt create test-branch --no-interactive --no-ai");
		expect(harness.events).toContain("slot-client:current");
		expect(harness.statuses).toEqual([
			"Inspecting worktree…",
			"Creating Graphite branch from latest commit…",
			"Checking out branch slot…",
		]);
		expect(stripAnsi(harness.notifications.at(-1)?.message ?? "")).toContain(
			"Worktree: /slots/slot-01",
		);
	});

	test("branch creation failure skips ji slot checkout", async () => {
		const harness = createHarness({
			prepareResult: { ok: false, error: "checkpoint prep failed" },
		});

		await createAutoslotFlow(harness.input);

		expect(harness.events.some((event) => event.startsWith("slot-client:"))).toBe(false);
		expect(harness.statuses).toEqual(["Inspecting worktree…", "Drafting checkpoint message…"]);
		const failure = harness.notifications.at(-1);
		expect(failure?.level).toBe("error");
		const failureText = stripAnsi(failure?.message ?? "");
		expect(failureText).toContain("Autoslot could not create a Graphite branch.");
		expect(failureText).toContain("checkpoint prep failed");
	});

	test("dirty post-autoslot worktree warns and skips ji slot checkout", async () => {
		const harness = createHarness({ isDirtyAfterAutobranch: true });

		await createAutoslotFlow(harness.input);

		expect(harness.events.some((event) => event.startsWith("slot-client:"))).toBe(false);
		expect(harness.notifications.at(-1)?.level).toBe("warning");
		expect(stripAnsi(harness.notifications.at(-1)?.message ?? "")).toContain(
			"slot movement was skipped",
		);
	});

	test("ji slot checkout failure reports useful error after autobranch succeeds", async () => {
		const harness = createHarness({
			slotFailure:
				"ji slot checkout --current failed (no_available_slot): No clean detached slot is available.",
		});

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("slot-client:current");
		const checkoutFailure = harness.notifications.at(-1);
		expect(checkoutFailure?.level).toBe("error");
		const checkoutFailureText = stripAnsi(checkoutFailure?.message ?? "");
		expect(checkoutFailureText).toContain(
			"Autoslot created test-branch, but ji slot checkout failed.",
		);
		expect(checkoutFailureText).toContain("No clean detached slot is available.");
		expect(harness.statuses.at(-1)).toBe("Checking out branch slot…");
	});

	test("dirty autoslot without requested slug reports branch-name derivation", async () => {
		const harness = createHarness();
		harness.input.args = {};

		await createAutoslotFlow(harness.input);

		expect(harness.statuses).toContain("Deriving branch name…");
		expect(harness.statuses.indexOf("Deriving branch name…")).toBeLessThan(
			harness.statuses.indexOf("Drafting checkpoint message…"),
		);
	});

	test("CLI routes phase output through onOutput and errors through stderr", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const output: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
		const input: AutoslotCliInput = {
			cwd: "/repo",
			env: {},
			args: { slug: "test-branch" },
			caps: TEST_CAPS,
			exec: async (command, args) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel")
					return { code: 0, killed: false, stdout: "/repo\n", stderr: "" };
				if (command === "git" && args[0] === "symbolic-ref")
					return { code: 0, killed: false, stdout: "source-branch\n", stderr: "" };
				if (command === "git" && args[0] === "status")
					return { code: 1, killed: false, stdout: "", stderr: "fatal: status failed\n" };
				throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
			},
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			onOutput: (stream, text) => output.push({ stream, text }),
		};

		const exitCode = await runAutoslotCli(input);

		expect(exitCode).toBe(1);
		expect(output).toEqual([{ stream: "stderr", text: "Inspecting worktree…\n" }]);
		expect(stdout).toEqual([]);
		expect(stderr.join("")).toContain("Could not inspect git status.");
		expect(stderr.join("")).toContain("fatal: status failed");
	});
});
