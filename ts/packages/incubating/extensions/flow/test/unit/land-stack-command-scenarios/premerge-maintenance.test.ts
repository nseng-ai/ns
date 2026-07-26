import { formatCommand } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";
import { executeStackLanding, parseArgs } from "../../../src/land/land-stack.ts";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { backupRefSteps } from "../land-stack-backup-ref-fixtures.ts";
import { expectedSquashMergeArgs, prSnapshot, prStdout } from "../land-stack-script-fixtures.ts";
import { TOPOLOGY_COMMAND } from "../land-test-helpers.ts";

import {
	singleBranchDomainPreflightWithRefs,
	singleBranchPreflightWithRefs,
} from "./feature-stack-fixtures.ts";
import {
	SHA_A,
	SHA_B,
	SHA_C,
	TOPOLOGY_ARGS,
	childrenRecheckStep,
	cleanRepoChecks,
	submitRestackRecheckStep,
} from "./repo-fixtures.ts";
import {
	FakePi,
	ROOT,
	TRUNK,
	commandMessagesText,
	createContext,
	expectSuccess,
	runLandStack,
	sameArgs,
	step,
	worktreeOutput,
} from "./support.ts";

describe("land-stack command scenarios", () => {
	test("offers to submit stale PR heads during preflight before merging", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt submit/update?");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain("head aaaaaaa != local bbbbbbb");
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("does not ask again for stale PR submit/update when pre-merge work is already approved", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("", script, {
			confirms: [true],
			executeOptions: {
				execution: {
					source: { type: "discover" },
					approvedConfirmationKinds: new Set(["submit-required-updates"]),
				},
			},
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Land this stack path?");
		expect(confirmations.map((confirmation) => confirmation.title)).not.toContain(
			"Run gt submit/update?",
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("reloads stack facts for the submit/update recheck after domain preflight", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const pi = new FakePi(script);
		const context = createContext({ confirms: [true] });

		await executeStackLanding(pi, context.ctx, expectSuccess(parseArgs("--yes")));

		pi.assertDone();
		const submitIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, submitArgs),
		);
		const stackReadIndices = pi.execCalls.flatMap((call, index) =>
			call.command === TOPOLOGY_COMMAND && sameArgs(call.args, TOPOLOGY_ARGS) ? [index] : [],
		);
		const recheckStackIndex = stackReadIndices.find((index) => index > submitIndex) ?? -1;
		const mergeIndex = pi.execCalls.findIndex(
			(call) => call.command === "gh" && call.args[1] === "merge",
		);
		expect(submitIndex).toBeGreaterThanOrEqual(0);
		expect(recheckStackIndex).toBeGreaterThan(submitIndex);
		expect(recheckStackIndex).toBeLessThan(mergeIndex);
		expect(stackReadIndices.filter((index) => index < mergeIndex)).toHaveLength(2);
		expect(context.notifications.at(-1)?.level).toBe("success");
	});
	test("offers to restack before submit/update when git reachability shows restack is needed", async () => {
		const restackArgs = ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"];
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("gt", restackArgs),
			submitRestackRecheckStep(),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_C, prSha: SHA_C }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_C } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_C}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_C })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_C })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_C,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt restack + submit/update?");
		expect(confirmations[0]?.message).toContain("needs restack before submit/update");
		expect(confirmations[0]?.message).toContain("- feature-a on main");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", restackArgs)}`);
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", submitArgs)}`);
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, restackArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		);
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(commandMessagesText(messages)).toContain(`✓ $ ${formatCommand("gt", restackArgs)}`);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("frees landing slots before restack and submit/update when both are required", async () => {
		const slotWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A, worktrees: slotWorktrees }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			step("gt", ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"]),
			submitRestackRecheckStep(),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true, true],
		});

		pi.assertDone();
		expect(confirmations.map((confirmation) => confirmation.title)).toEqual([
			"Free landing slots?",
			"Run gt restack + submit/update?",
		]);
		const slotIndex = pi.execCalls.findIndex(
			(call) => call.command === "ns" && call.args[0] === "slot",
		);
		const restackIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && call.args[0] === "restack",
		);
		const submitIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, submitArgs),
		);
		const mergeIndex = pi.execCalls.findIndex(
			(call) => call.command === "gh" && call.args[1] === "merge",
		);
		expect(slotIndex).toBeLessThan(restackIndex);
		expect(restackIndex).toBeLessThan(submitIndex);
		expect(submitIndex).toBeLessThan(mergeIndex);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("stops when gt restack silently leaves branches unrestacked", async () => {
		const restackArgs = ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"];
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("gt", restackArgs),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("still not restacked");
		expect(commandMessagesText(messages)).toContain(
			"gt restack exits 0 while skipping branches checked out in other worktrees",
		);
		expect(
			pi.execCalls.some((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
	test("stops when managed slot conflicts reappear after submit/update", async () => {
		const slotWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A, worktrees: slotWorktrees }),
			submitRestackRecheckStep(),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({
				localSha: SHA_B,
				prSha: SHA_B,
				worktrees: slotWorktrees,
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script, {
			confirms: [true, true],
		});

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain(
			"Landing branches are checked out in managed slots after submit/update",
		);
		expect(commandMessagesText(messages)).toContain("slot-01 feature-a");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
});
