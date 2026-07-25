import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import { describe, expect, test } from "vitest";
import { BACKUP_REF_NAMESPACE } from "../../../src/land/stack/constants.ts";
import {
	BACKUP_ROTATION_ARGS,
	BACKUP_ROTATION_STEP,
	backupRefSteps,
	backupSnapshotFetchArgs,
} from "../land-stack-backup-ref-fixtures.ts";
import { formatLiveBranchTips } from "../land-test-helpers.ts";

import { mergeSingleFeatureA, singleBranchPreflight } from "./feature-stack-fixtures.ts";
import { SHA_A } from "./repo-fixtures.ts";
import { commandMessagesText, runLandStack, sameArgs, step } from "./support.ts";

describe("land-stack command scenarios", () => {
	test("rotates backup refs before pruning current stale refs and writing new snapshots", async () => {
		const staleCurrentRef = `${BACKUP_REF_NAMESPACE}/old-branch`;
		const script = [
			...singleBranchPreflight(""),
			...backupRefSteps(["feature-a"], { staleCurrentRefs: [staleCurrentRef] }),
			...mergeSingleFeatureA(),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		const rotationIndex = pi.execCalls.findIndex(
			(call) => call.command === "git" && sameArgs(call.args, BACKUP_ROTATION_ARGS),
		);
		const staleListIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "git" &&
				sameArgs(call.args, ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE]),
		);
		const staleDeleteIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "git" && sameArgs(call.args, ["update-ref", "-d", staleCurrentRef]),
		);
		const snapshotListIndex = pi.execCalls.findIndex(
			(call, index) =>
				index > staleDeleteIndex &&
				call.command === "git" &&
				sameArgs(call.args, [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS]),
		);
		const snapshotWriteIndex = pi.execCalls.findIndex(
			(call, index) =>
				index > snapshotListIndex &&
				call.command === "git" &&
				sameArgs(call.args, backupSnapshotFetchArgs(["feature-a"])),
		);
		expect(rotationIndex).toBeGreaterThanOrEqual(0);
		expect(staleListIndex).toBeGreaterThan(rotationIndex);
		expect(staleDeleteIndex).toBeGreaterThan(staleListIndex);
		expect(snapshotListIndex).toBeGreaterThan(staleDeleteIndex);
		expect(snapshotWriteIndex).toBeGreaterThan(snapshotListIndex);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("backup ref rotation failure stops before landing any PRs", async () => {
		const script = [
			...singleBranchPreflight(""),
			step("git", BACKUP_ROTATION_ARGS, { code: 1, stderr: "cannot rotate refs" }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("no PRs were landed");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
	});
	test("backup ref stale-listing failure stops before landing any PRs", async () => {
		const script = [
			...singleBranchPreflight(""),
			BACKUP_ROTATION_STEP,
			step("git", ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE], {
				code: 1,
				stderr: "cannot list refs",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("no PRs were landed");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
	});
	test("backup ref batched snapshot failure stops before landing any PRs", async () => {
		const script = [
			...singleBranchPreflight(""),
			BACKUP_ROTATION_STEP,
			step("git", ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE]),
			step("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], {
				stdout: formatLiveBranchTips(["feature-a"], { shaOverrides: { "feature-a": SHA_A } }),
			}),
			step("git", backupSnapshotFetchArgs(["feature-a"]), {
				code: 1,
				stderr: "cannot write backup refs",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("no PRs were landed");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
	});
});
