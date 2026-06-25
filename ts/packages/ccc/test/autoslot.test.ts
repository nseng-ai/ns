import { describe, expect, test } from "vitest";
import type { AutoslotCliInput, AutoslotFlowInput } from "../src/autoslot.ts";
import { createAutoslotFlow, runAutoslotCli } from "../src/autoslot.ts";
import { fail, ok, type CommandResult } from "./autobranch-test-helpers.ts";

interface HarnessOptions {
	mode?: "dirty" | "latest_commit";
	prepareResult?: { ok: true; message: string } | { ok: false; error: string };
	isDirtyAfterAutobranch?: boolean;
	slotStdout?: string;
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
		now: () => 123,
		exec: (command, args) => exec(command, args),
		slotExec: {
			exec: async (command, args) => {
				events.push(`slot:${command} ${args.join(" ")}`);
				return {
					code: options.slotStdout === undefined ? 0 : 3,
					killed: false,
					stdout:
						options.slotStdout ??
						JSON.stringify({
							exitCode: 0,
							data: {
								slot_name: "slot-01",
								branch_name: "test-branch",
								worktree_path: "/slots/slot-01",
								cd_command: "cd /slots/slot-01",
								already_assigned: false,
							},
						}),
					stderr: "",
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
			clearPhase: () => statuses.push(undefined),
		},
	};

	return { input, events, notifications, statuses };
}

describe("autoslot flow", () => {
	test("successful dirty autoslot runs slot checkout current", async () => {
		const harness = createHarness();

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("commit");
		expect(harness.events).toContain("slot:slot checkout --current --format json --no-clipboard");
		expect(harness.statuses).toEqual([
			"Inspecting worktree…",
			"Drafting checkpoint message…",
			"Creating Graphite branch and checkpoint…",
			"Checking out branch slot…",
		]);
		expect(harness.notifications.at(-1)).toEqual({
			level: "info",
			message: [
				"Autoslot moved test-branch to slot-01.",
				"Worktree: /slots/slot-01",
				"slot co test-branch",
			].join("\n"),
		});
	});

	test("successful latest-commit autoslot runs slot checkout current", async () => {
		const harness = createHarness({ mode: "latest_commit" });

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("exec:git reset --hard parent987654");
		expect(harness.events).toContain("exec:gt create test-branch --no-interactive --no-ai");
		expect(harness.events).toContain("slot:slot checkout --current --format json --no-clipboard");
		expect(harness.statuses).toEqual([
			"Inspecting worktree…",
			"Creating Graphite branch from latest commit…",
			"Checking out branch slot…",
		]);
		expect(harness.notifications.at(-1)?.message).toContain("Worktree: /slots/slot-01");
	});

	test("branch creation failure skips slot checkout", async () => {
		const harness = createHarness({
			prepareResult: { ok: false, error: "checkpoint prep failed" },
		});

		await createAutoslotFlow(harness.input);

		expect(harness.events.some((event) => event.startsWith("slot:slot checkout"))).toBe(false);
		expect(harness.statuses).toEqual(["Inspecting worktree…", "Drafting checkpoint message…"]);
		expect(harness.notifications).toContainEqual({
			level: "error",
			message: "checkpoint prep failed",
		});
	});

	test("dirty post-autoslot worktree warns and skips slot checkout", async () => {
		const harness = createHarness({ isDirtyAfterAutobranch: true });

		await createAutoslotFlow(harness.input);

		expect(harness.events.some((event) => event.startsWith("slot:slot checkout"))).toBe(false);
		expect(harness.notifications.at(-1)?.level).toBe("warning");
		expect(harness.notifications.at(-1)?.message).toContain("slot movement was skipped");
	});

	test("slot checkout failure reports useful error after autobranch succeeds", async () => {
		const harness = createHarness({
			slotStdout: JSON.stringify({
				exitCode: 3,
				errorType: "no_available_slot",
				message: "No clean detached slot is available.",
			}),
		});

		await createAutoslotFlow(harness.input);

		expect(harness.events).toContain("slot:slot checkout --current --format json --no-clipboard");
		expect(harness.notifications.at(-1)?.level).toBe("error");
		expect(harness.notifications.at(-1)?.message).toContain(
			"Autoslot created test-branch, but slot checkout failed.",
		);
		expect(harness.notifications.at(-1)?.message).toContain("No clean detached slot is available.");
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
		expect(stderr.join("")).toContain("Could not read git status.");
		expect(stderr.join("")).toContain("fatal: status failed");
	});
});
