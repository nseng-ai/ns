import { noopNsCommandIo } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";
import { runLandCli } from "../../../src/land/land.ts";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { expectedSquashMergeArgs, prSnapshot, prStdout } from "../land-stack-script-fixtures.ts";

import { featureStackPreflight, singleBranchPreflight } from "./feature-stack-fixtures.ts";
import { linearStackLandingScript } from "./linear-stack-fixtures.ts";
import {
	CURRENT,
	DB_SINGLE_BRANCH,
	DB_TO_CURRENT,
	DESCENDANT,
	fromManagedCurrentSlot,
	repoIntro,
	SHA_A,
} from "./repo-fixtures.ts";
import {
	captureConsole,
	CURRENT_SLOT_ROOT,
	FakePi,
	ROOT,
	runLandStack,
	sameArgs,
	step,
	TRUNK,
	worktreeOutput,
} from "./support.ts";
import type { Confirmation } from "./support.ts";

describe("land-stack command scenarios", () => {
	test("managed current slot single-PR landing combines approval and ordered cleanup", async () => {
		const script = fromManagedCurrentSlot([
			...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_A,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			step("ns", ["slot", "free", "--wt", "slot-03"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		]);
		const pi = new FakePi(script);
		const confirmations: Confirmation[] = [];
		const exitCode = await runLandCli({
			cwd: CURRENT_SLOT_ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: () => {},
			stderr: () => {},
			progressIo: noopNsCommandIo,
			confirm: async (title, message) => {
				confirmations.push({ title, message });
				return true;
			},
		});

		pi.assertDone();
		expect(exitCode).toBe(0);
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Land this PR?");
		expect(confirmations[0]?.message).toContain("Slot: slot-03");
		expect(confirmations[0]?.message).toContain(`Worktree: ${CURRENT_SLOT_ROOT}`);
		expect(confirmations[0]?.message).toContain("Local branch: feature-a");
		expect(confirmations[0]?.message).toContain("$ ns slot free --wt slot-03");
		expect(confirmations[0]?.message).toContain("$ gt delete feature-a -f -q");
		const verificationIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" && sameArgs(call.args, ["pr", "view", "101", "--json", PR_FIELDS]),
		);
		const freeIndex = pi.execCalls.findIndex(
			(call) => call.command === "ns" && sameArgs(call.args, ["slot", "free", "--wt", "slot-03"]),
		);
		const deleteIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, ["delete", "feature-a", "-f", "-q"]),
		);
		expect(verificationIndex).toBeGreaterThanOrEqual(0);
		expect(freeIndex).toBeGreaterThan(verificationIndex);
		expect(deleteIndex).toBeGreaterThan(freeIndex);
	});
	test("managed current slot canonical stack landing combines approval and ordered cleanup", async () => {
		const script = [
			...fromManagedCurrentSlot(linearStackLandingScript(3)),
			step("ns", ["slot", "free", "--wt", "slot-03"]),
			step("gt", ["delete", "feature-3", "-f", "-q"]),
		];
		const { pi, confirmations, notifications } = await runLandStack("", script, {
			cwd: CURRENT_SLOT_ROOT,
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Land this stack path?");
		expect(confirmations[0]?.message).toContain("Slot: slot-03");
		expect(confirmations[0]?.message).toContain(`Worktree: ${CURRENT_SLOT_ROOT}`);
		expect(confirmations[0]?.message).toContain("Local branch: feature-3");
		expect(confirmations[0]?.message).toContain("$ ns slot free --wt slot-03");
		expect(confirmations[0]?.message).toContain("$ gt delete feature-3 -f -q");
		const verificationIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" && sameArgs(call.args, ["pr", "view", "203", "--json", PR_FIELDS]),
		);
		const freeIndex = pi.execCalls.findIndex(
			(call) => call.command === "ns" && sameArgs(call.args, ["slot", "free", "--wt", "slot-03"]),
		);
		const finalDeleteIndex = pi.execCalls.findLastIndex(
			(call) => call.command === "gt" && sameArgs(call.args, ["delete", "feature-3", "-f", "-q"]),
		);
		expect(verificationIndex).toBeGreaterThanOrEqual(0);
		expect(freeIndex).toBeGreaterThan(verificationIndex);
		expect(finalDeleteIndex).toBeGreaterThan(freeIndex);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("managed current slot single-PR decline performs no mutation", async () => {
		const pi = new FakePi(
			fromManagedCurrentSlot(repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH })).concat(
				step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
					stdout: prStdout(
						prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
					),
				}),
			),
		);
		const confirmations: Confirmation[] = [];
		const exitCode = await runLandCli({
			cwd: CURRENT_SLOT_ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: () => {},
			stderr: () => {},
			progressIo: noopNsCommandIo,
			confirm: async (title, message) => {
				confirmations.push({ title, message });
				return false;
			},
		});

		pi.assertDone();
		expect(exitCode).toBe(0);
		expect(confirmations).toHaveLength(1);
		expect(
			pi.execCalls.some(
				(call) =>
					(call.command === "gh" && call.args.includes("merge")) ||
					(call.command === "ns" && call.args[0] === "slot") ||
					(call.command === "gt" && call.args[0] === "delete") ||
					(call.command === "git" && call.args[0] === "update-ref"),
			),
		).toBe(false);
	});
	test("managed current slot single-PR noninteractive refusal performs no mutation", async () => {
		const pi = new FakePi(
			fromManagedCurrentSlot(repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH })).concat(
				step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
					stdout: prStdout(
						prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
					),
				}),
			),
		);
		const output: string[] = [];
		const exitCode = await runLandCli({
			cwd: CURRENT_SLOT_ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => output.push(text),
			stderr: (text) => output.push(text),
			progressIo: noopNsCommandIo,
		});

		pi.assertDone();
		expect(exitCode).toBe(1);
		expect(
			pi.execCalls.some(
				(call) =>
					(call.command === "gh" && call.args.includes("merge")) ||
					(call.command === "ns" && call.args[0] === "slot") ||
					(call.command === "gt" && call.args[0] === "delete") ||
					(call.command === "git" && call.args[0] === "update-ref"),
			),
		).toBe(false);
	});
	test("--dry-run builds and presents the plan without mutating", async () => {
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			featureStackPreflight({ dbRows: DB_TO_CURRENT }),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain("Dry run only; no PRs or local refs were changed.");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});
	test("--dry-run treats descendant sdl slot checkouts as skipped maintenance", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications[0]?.message).toContain(
			"Will leave open without automatic restack/update because these descendants are checked out elsewhere:",
		);
		expect(notifications[0]?.message).toContain("slot-07 feature-c");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
	test("non-interactive mode without --yes refuses before mutation", async () => {
		const { pi } = await captureConsole(() =>
			runLandStack("", featureStackPreflight({ dbRows: DB_TO_CURRENT }), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});
	test("managed slot conflict in non-interactive mode refuses and does not free slots", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const { pi } = await captureConsole(() =>
			runLandStack("--yes", singleBranchPreflight(managedWorktrees), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
});
