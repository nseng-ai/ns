// Scenario tests for `ns dispatch prompt`: final source revalidation and post-publication failures.
import { describe, expect, test } from "vitest";

import { PROMPT, TRACKED_PLAN, runPromptCommand } from "./dispatch-prompt-command-support.ts";

describe("ns dispatch prompt source revalidation", () => {
	test.each([
		["source read", { isNotARepository: true }, "source-read-failed"],
		["repository drift", { repoRoot: "/other" }, "repository-drift"],
		["branch drift", { branch: "feature/other" }, "branch-drift"],
		["head mismatch", { headSha: "d".repeat(40) }, "head-drift"],
		["dirty worktree", { dirtyPaths: ["conflicted.ts"] }, "dirty-tree"],
		[
			"remote mismatch",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"post-Graphite %s acknowledges prior publication and creates no anchor",
		async (_label, afterGraphitePublication, reason) => {
			const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
				git: {
					remoteTip: { type: "missing" },
					afterGraphitePublication,
				},
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-publication-verification-failed");
			expect(exit.data).toMatchObject({
				sourcePublication: "graphite-submitted",
				reason,
				affectedBranches: ["feature/widgets", "feature/base"],
				totalAffectedBranches: 2,
				mutation: { local: "none", remote: "observed" },
				anchorCreated: false,
				runStarted: false,
			});
			expect(exit.message).toContain("no dispatch anchor or run was created");
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.anchorPrs.opened).toEqual([]);
			expect(gateways.trigger.startCalls).toEqual([]);
		},
	);

	test("post-publication anchor availability failure acknowledges mutation and no anchor/run", async () => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: {
				remoteTip: { type: "missing" },
				anchorAvailabilityError: {
					type: "error",
					error: { code: "git-ls-remote-failed", message: "Could not inspect origin." },
				},
			},
			sourcePublication: { plan: TRACKED_PLAN },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("anchor-branch-availability-failed");
		expect(exit.data).toMatchObject({
			sourcePublication: "graphite-submitted",
			affectedBranches: ["feature/widgets", "feature/base"],
			totalAffectedBranches: 2,
			mutation: { local: "none", remote: "observed" },
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.message).toContain("no dispatch anchor or run was created");
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test("second preflight failure acknowledges Graphite publication and creates no anchor", async () => {
		const { exit, gateways } = await runPromptCommand(["--force", PROMPT], {
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			config: { dispatchSettingsAfterPublication: { type: "missing" } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-publication-verification-failed");
		expect(exit.data).toMatchObject({
			reason: "preflight-failed",
			mutation: { local: "none", remote: "observed" },
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.data).toHaveProperty("checks");
		expect(gateways.git.anchorPushes).toEqual([]);
		expect(gateways.anchorPrs.opened).toEqual([]);
	});

	test.each([
		["concurrent HEAD drift", { headSha: "d".repeat(40) }, "head-drift"],
		[
			"remote mismatch",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"plain Git %s creates no anchor after the exact-SHA push",
		async (_label, afterGitPush, reason) => {
			const { exit, gateways } = await runPromptCommand([PROMPT], {
				git: {
					remoteTip: { type: "missing" },
					afterGitPush,
				},
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-publication-verification-failed");
			expect(exit.data).toMatchObject({
				sourcePublication: "git-pushed",
				reason,
				mutation: { local: "none", remote: "possible" },
				anchorCreated: false,
				runStarted: false,
			});
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.anchorPrs.opened).toEqual([]);
		},
	);

	test.each([
		["HEAD drift", { headSha: "d".repeat(40) }, "head-drift"],
		["dirty-tree drift", { dirtyPaths: ["late-change.ts"] }, "dirty-tree"],
		[
			"remote-tip drift",
			{ remoteTip: { type: "found" as const, sha: "e".repeat(40) } },
			"remote-tip-mismatch",
		],
	] as const)(
		"already-current %s fails the final gate without publication evidence",
		async (_label, beforeFinalValidation, reason) => {
			const { exit, gateways } = await runPromptCommand([PROMPT], {
				git: { beforeFinalValidation },
			});

			expect(exit.type).toBe("failure");
			if (exit.type !== "failure") return;
			expect(exit.errorType).toBe("source-revalidation-failed");
			expect(exit.data).toMatchObject({ reason, anchorCreated: false, runStarted: false });
			expect(exit.data).not.toHaveProperty("sourcePublication");
			expect(exit.data).not.toHaveProperty("mutation");
			expect(gateways.git.anchorPushes).toEqual([]);
			expect(gateways.operations).not.toContain("git:check-anchor-availability");
			expect(gateways.operations.lastIndexOf("git:resolve-source-ref")).toBeGreaterThan(0);
		},
	);

	test("already-current final preflight failure is non-mutating", async () => {
		const { exit, gateways } = await runPromptCommand([PROMPT], {
			config: { dispatchSettingsBeforeFinalValidation: { type: "missing" } },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("source-revalidation-failed");
		expect(exit.data).toMatchObject({
			reason: "preflight-failed",
			anchorCreated: false,
			runStarted: false,
		});
		expect(exit.data).toHaveProperty("checks");
		expect(gateways.git.anchorPushes).toEqual([]);
	});
});
