import { describe, expect, test } from "bun:test";

import landStackExtension, {
	completeLandStackArgs,
	formatLandingPlan,
	LAND_STACK_HELP,
	parseLandStackArgs,
	resolveStackWalkFromGtLogOutput,
	type CommandContext,
	type ExtensionAPI,
	type NotifyLevel,
	type PreflightSnapshot,
	type StackWalkResolution,
	type StackWalkResult,
} from "../src/land-stack.ts";
import type { PiExecResultLike } from "../src/command-runtime.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

type StatusCall = {
	key: string;
	value: string | undefined;
};

type ExecCall = {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
};

type ScriptedExec = {
	command: string;
	args: string[];
	result: Partial<PiExecResultLike> | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function createContext(): {
	ctx: CommandContext;
	notifications: Notification[];
	statusCalls: StatusCall[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const statusCalls: StatusCall[] = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: "/repo",
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(): Promise<boolean> {
				return false;
			},
			setStatus(key: string, value: string | undefined): void {
				statusCalls.push({ key, value });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statusCalls, waitForIdleCalls: () => waits };
}

async function runLandStackCommand(args: string, script: ScriptedExec[] = []): Promise<{
	pi: FakePi;
	notifications: Notification[];
	statusCalls: StatusCall[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	landStackExtension(pi);
	const command = pi.commands.get("land-stack");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("land-stack was not registered");
	}

	const context = createContext();
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<PiExecResultLike> = {}): PiExecResultLike {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<PiExecResultLike>): ScriptedExec {
	return { command, args, result };
}

function completionValues(prefix: string): string[] {
	return completeLandStackArgs(prefix)?.map((item) => item.value) ?? [];
}

function expectOk(result: StackWalkResult): StackWalkResolution {
	expect(result.ok).toBe(true);
	if (!result.ok) {
		throw new Error(`expected ok result, got ${result.failure.kind}`);
	}
	return result.value;
}

function expectFailureKind(result: StackWalkResult): string {
	expect(result.ok).toBe(false);
	if (result.ok) {
		throw new Error("expected failure result");
	}
	return result.failure.kind;
}

function resolveGtLog(stdout: string, currentBranch = "feature/current", trunkBranch = "main"): StackWalkResult {
	return resolveStackWalkFromGtLogOutput(stdout, {
		cwd: "/repo",
		gitCurrentBranch: currentBranch,
		graphiteTrunkBranch: trunkBranch,
	});
}

describe("land-stack args", () => {
	test("parses known flags and aliases", () => {
		expect(parseLandStackArgs("--yes -y --dry-run --help -h")).toEqual({
			ok: true,
			args: { yes: true, dryRun: true, help: true },
		});
	});

	test("repeated flags are harmless", () => {
		expect(parseLandStackArgs("--yes --yes --dry-run --dry-run")).toEqual({
			ok: true,
			args: { yes: true, dryRun: true, help: false },
		});
	});

	test("unknown argument fails before preflight with exact argument", () => {
		expect(parseLandStackArgs("--yes --surprise")).toEqual({ ok: false, unknownArg: "--surprise" });
	});

	test("completions suggest only matching long options", () => {
		expect(completionValues("")).toEqual(["--yes", "--dry-run", "--help"]);
		expect(completionValues("--d")).toEqual(["--dry-run"]);
		expect(completionValues("-")).toEqual(["--yes", "--dry-run", "--help"]);
		expect(completionValues("-y")).toEqual([]);
		expect(completionValues("--yes ")).toEqual(["--yes", "--dry-run", "--help"]);
	});

	test("help text is exact", () => {
		expect(LAND_STACK_HELP).toBe(`Usage:
/land-stack [--yes] [--dry-run] [--help]

Lands the current Graphite stack path from bottom branch through the current branch, one PR at a time.
Requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no manual worktree conflicts; can offer to run gt restack + submit/update for stale PR heads before merging.

Options:
  --yes, -y    Skip the main landing confirmation. PR submit/update and managed slot cleanup still require explicit UI confirmation.
  --dry-run    Show the plan and exit before mutating anything.
  --help, -h   Show this help.`);
	});
});

describe("land-stack command shell", () => {
	test("registers command with description and completions", () => {
		const pi = new FakePi();
		landStackExtension(pi);
		const command = pi.commands.get("land-stack");

		expect(command?.description).toBe("Land the current Graphite stack path bottom-to-current, one PR at a time");
		expect(command?.getArgumentCompletions?.("--h")).toEqual([{ value: "--help", label: "--help" }]);
	});

	test("help waits for idle and emits help before any other work", async () => {
		const result = await runLandStackCommand("--help");

		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.notifications).toEqual([{ message: LAND_STACK_HELP, level: "info" }]);
		expect(result.statusCalls).toEqual([{ key: "land-stack", value: undefined }]);
	});

	test("unknown args wait for idle and emit exact error", async () => {
		const result = await runLandStackCommand("--unknown");

		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.notifications).toEqual([{ message: "Unknown /land-stack argument: --unknown", level: "error" }]);
		expect(result.statusCalls).toEqual([{ key: "land-stack", value: undefined }]);
	});
});

describe("land-stack dry-run and plan", () => {
	test("formats a no-descendant plan with fixed safety sections", () => {
		expect(formatLandingPlan(baseSnapshot())).toBe(`Land Graphite stack path: main -> feature/current

Current branch: feature/current
Trunk branch: main

Will merge, in order:
  1. #101 feature/current abc1234 Add current branch Current branch

No descendant PRs above the current branch will be merged.

No pre-merge PR submit/update is required.

No managed slot cleanup is required before merging.

For each merged PR:
  - gh pr merge <number> --squash --match-head-commit <sha>
  - verify PR is MERGED on main
  - if another branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive
  - gt delete <landed-branch> -f -q
  - restack/submit the next branch only, if one remains

Will not merge descendants above current, will not delete remote branches, will not run global gt sync --delete-all, will not wait for checks or enable auto-merge, and will stop on first failure.`);
	});

	test("dry-run performs read-only preflight and emits the full plan", async () => {
		const result = await runLandStackCommand("--dry-run", happyDryRunScript());

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.notifications).toHaveLength(1);
		expect(result.notifications[0]?.level).toBe("info");
		expect(result.notifications[0]?.message.startsWith("Dry run only; no PRs or local refs were changed.\n\nLand Graphite stack path: main -> feature/current")).toBe(true);
		expect(result.notifications[0]?.message).toContain("No managed slot cleanup is required before merging.");
		expect(result.statusCalls).toEqual([
			{ key: "land-stack", value: "preflighting land-stack…" },
			{ key: "land-stack", value: undefined },
		]);
	});
});

function baseSnapshot(): PreflightSnapshot {
	return {
		repoRoot: "/repo",
		currentBranch: "feature/current",
		trunkBranch: "main",
		stack: {
			backendCurrentBranch: "feature/current",
			sourceRootBranch: "main",
			landingBranches: ["feature/current"],
			descendantBranches: [],
			warnings: [],
		},
		landingBranches: [
			{
				branch: "feature/current",
				localSha: "abc1234567890",
				shortSha: "abc1234",
				pr: {
					number: 101,
					title: "Add current branch",
					state: "OPEN",
					isDraft: false,
					headRefName: "feature/current",
					headRefOid: "abc1234567890",
					baseRefName: "main",
					mergedAt: null,
					url: "https://github.example/repo/pull/101",
				},
			},
		],
		descendantBranches: [],
		worktreeConflicts: { manual: [], managedSlots: [] },
		staleMetadata: { items: [] },
		restackRequirement: null,
		warnings: [],
	};
}

function happyDryRunScript(): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: "/repo\n" }),
		step("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { stdout: "feature/current\n" }),
		step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
		step("gt", ["log", "short", "--stack", "-r", "--no-interactive"], { stdout: "◯ main\n◉ feature/current\n" }),
		step("git", ["status", "--porcelain=v1"], { stdout: "" }),
		step("git", ["rev-parse", "--git-path", "MERGE_HEAD"], { stdout: "/tmp/pi-land-stack-missing/MERGE_HEAD\n" }),
		step("git", ["rev-parse", "--git-path", "CHERRY_PICK_HEAD"], { stdout: "/tmp/pi-land-stack-missing/CHERRY_PICK_HEAD\n" }),
		step("git", ["rev-parse", "--git-path", "REVERT_HEAD"], { stdout: "/tmp/pi-land-stack-missing/REVERT_HEAD\n" }),
		step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: "/tmp/pi-land-stack-missing/rebase-merge\n" }),
		step("git", ["rev-parse", "--git-path", "rebase-apply"], { stdout: "/tmp/pi-land-stack-missing/rebase-apply\n" }),
		step("git", ["show-ref", "--verify", "--quiet", "refs/heads/feature/current"]),
		step("git", ["rev-parse", "refs/heads/feature/current"], { stdout: "abc1234567890\n" }),
		step("gh", ["pr", "view", "feature/current", "--json", "number,title,state,isDraft,headRefName,headRefOid,baseRefName,mergedAt,url"], {
			stdout: JSON.stringify(baseSnapshot().landingBranches[0]?.pr),
		}),
		step("git", ["merge-base", "--is-ancestor", "refs/heads/main", "refs/heads/feature/current"]),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: "worktree /repo\nHEAD abc1234567890\nbranch refs/heads/feature/current\n\n",
		}),
	];
}

describe("resolveStackWalkFromGtLogOutput", () => {
	test("resolves trunk to ancestor to current path", () => {
		const value = expectOk(resolveGtLog(`◯ main
◯ feature/a
◉ feature/current`));

		expect(value).toEqual({
			backendCurrentBranch: "feature/current",
			sourceRootBranch: "main",
			landingBranches: ["feature/a", "feature/current"],
			descendantBranches: [],
			warnings: [],
		});
	});

	test("keeps descendants nearest to farthest above current", () => {
		const value = expectOk(resolveGtLog(`◯ main
◯ feature/a
◉ feature/current
◯ feature/child
◯ feature/grandchild`));

		expect(value.landingBranches).toEqual(["feature/a", "feature/current"]);
		expect(value.descendantBranches).toEqual(["feature/child", "feature/grandchild"]);
	});

	test("strips trailing annotations while preserving branch names with spaces", () => {
		const value = expectOk(resolveGtLog(`◯ main
◉ feature with spaces (needs restack)`, "feature with spaces"));

		expect(value.backendCurrentBranch).toBe("feature with spaces");
		expect(value.landingBranches).toEqual(["feature with spaces"]);
	});

	test("ignores off-column branches and counts them", () => {
		const value = expectOk(resolveGtLog(`◯ main
  ◯ feature/sibling
◯ feature/a
◉ feature/current`));

		expect(value.landingBranches).toEqual(["feature/a", "feature/current"]);
		expect(value.descendantBranches).toEqual([]);
		expect(value.warnings).toEqual([{ kind: "off-column-branches-ignored", count: 1 }]);
	});

	test("warns on multiple current markers and uses the first", () => {
		const value = expectOk(resolveGtLog(`◯ main
◉ feature/current
◉ feature/other-current`));

		expect(value.backendCurrentBranch).toBe("feature/current");
		expect(value.landingBranches).toEqual(["feature/current"]);
		expect(value.descendantBranches).toEqual(["feature/other-current"]);
		expect(value.warnings).toEqual([{ kind: "multiple-current-markers" }]);
	});

	test("fails when no current marker exists", () => {
		expect(expectFailureKind(resolveGtLog(`◯ main
◯ feature/a`))).toBe("no-current-marker");
	});

	test("warns when gt log source root differs from gt trunk", () => {
		const value = expectOk(resolveGtLog(`◯ develop
◉ feature/current`));

		expect(value.sourceRootBranch).toBe("develop");
		expect(value.landingBranches).toEqual(["feature/current"]);
		expect(value.warnings).toEqual([{ kind: "source-root-differs-from-trunk", sourceRoot: "develop", trunk: "main" }]);
	});

	test("does not hide current branch mismatches inside the parser", () => {
		const value = expectOk(resolveGtLog(`◯ main
◉ feature/current`, "different-local-branch"));

		expect(value.backendCurrentBranch).toBe("feature/current");
		expect(value.landingBranches).toEqual(["feature/current"]);
	});

	test("does not include trunk or source root in landing branches", () => {
		const branchOnTrunk = expectOk(resolveGtLog(`◉ main`, "main"));
		expect(branchOnTrunk.sourceRootBranch).toBeNull();
		expect(branchOnTrunk.landingBranches).toEqual([]);

		const sourceRootDiffers = expectOk(resolveGtLog(`◯ develop
◯ feature/a
◉ feature/current`));
		expect(sourceRootDiffers.landingBranches).toEqual(["feature/a", "feature/current"]);
		expect(sourceRootDiffers.landingBranches).not.toContain("main");
		expect(sourceRootDiffers.landingBranches).not.toContain("develop");
	});
});
