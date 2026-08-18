import { describe, expect, test } from "vitest";

import { BRANCH_CONTEXT_NAMESPACE, type BranchContextContext } from "@nseng-ai/branch-context/api";
import { BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE } from "@nseng-ai/branch-context";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import type { GitOperationResult } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { runDormantGsExistingBranchContextReuse } from "../src/dormant-existing-branch-context-reuse.ts";
import type { CommandContext, ExtensionAPI } from "../src/host-types.ts";
import type { GsPiCommandApi } from "../src/pi-command-api.ts";

const rawPi: ExtensionAPI = {
	registerCommand() {},
	async exec() {
		throw new Error("provider command was unexpectedly called");
	},
};
const pi: GsPiCommandApi = {
	rawPi,
	async exec() {
		throw new Error("provider command was unexpectedly called");
	},
};

function sessionEntry(branch: string, key: string): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
			details: {
				status: "success",
				evidence: {
					slug: "dormant-reuse",
					branch,
					startPoint: "0123456789abcdef0123456789abcdef01234567",
					creation: { type: "plain-git", startRef: "HEAD" },
					namespace: BRANCH_CONTEXT_NAMESPACE,
					key,
					refName: "refs/brmem/test",
					commit: "abc123",
					sourceFile: "/tmp/plan.md",
				},
			},
		},
	};
}

function fixture(
	entries: Array<{ branch: string; key: string }>,
	currentBranch = "current",
	state: {
		checkout?: GitOperationResult;
		cancelled?: boolean;
		newSessionFailure?: Error;
	} = {},
) {
	const git = new InMemoryGitGateway({ currentBranch });
	const brmem = new InMemoryBranchMemoryGateway({ entries });
	const context: BranchContextContext = { commands: pi, git, brmem };
	const checkoutCommands: string[] = [];
	const checkoutGit = {
		async checkout(input: { branch: string }): Promise<GitOperationResult> {
			checkoutCommands.push(`git checkout ${input.branch}`);
			return state.checkout ?? { ok: true };
		},
	};
	const replacementMessages: string[] = [];
	const parentSessions: Array<string | undefined> = [];
	const notices: Array<{ message: string; level?: string }> = [];
	const launchContext: CommandContext = {
		cwd: "/repo",
		hasUI: true,
		ui: {
			notify(message, level) {
				notices.push({ message, ...(level === undefined ? {} : { level }) });
			},
			setStatus() {},
		},
		async waitForIdle() {},
		sessionManager: { getSessionFile: () => "/sessions/source.jsonl" },
		async newSession(options) {
			parentSessions.push(options?.parentSession);
			if (state.newSessionFailure !== undefined) throw state.newSessionFailure;
			if (!state.cancelled) {
				await options?.withSession?.({
					cwd: "/repo",
					hasUI: true,
					ui: { notify() {}, setStatus() {} },
					async waitForIdle() {},
					async newSession() {
						return { cancelled: false };
					},
					async sendUserMessage(message: string) {
						replacementMessages.push(message);
					},
				});
			}
			return { cancelled: state.cancelled ?? false };
		},
	};
	return {
		git,
		context,
		checkoutGit,
		checkoutCommands,
		launchContext,
		replacementMessages,
		parentSessions,
		notices,
	};
}

function options(subject: ReturnType<typeof fixture>) {
	return {
		pi,
		cwd: "/repo",
		context: subject.context,
		checkoutGit: subject.checkoutGit,
		launchContext: subject.launchContext,
	};
}

describe("private dormant GS existing-branch reuse orchestration", () => {
	test("preserves candidate selection, exact checkout, and fresh-session dispatch", async () => {
		for (const candidate of [
			{
				branchName: "explicit",
				sessionEntries: [],
				expected: "explicit",
				source: "explicit-branch",
			},
			{
				sessionEntries: [sessionEntry("session", "session-target-plan.md")],
				expected: "session",
				source: "session-output",
			},
			{ sessionEntries: [], expected: "current", source: "current-branch" },
		] as const) {
			const subject = fixture([
				{ branch: "explicit", key: "explicit-target-plan.md" },
				{ branch: "session", key: "session-target-plan.md" },
				{ branch: "current", key: "current-target-plan.md" },
			]);
			const result = await runDormantGsExistingBranchContextReuse({
				...options(subject),
				...(candidate.branchName === undefined ? {} : { branchName: candidate.branchName }),
				sessionEntries: candidate.sessionEntries,
				dryRun: false,
			});

			expect(result).toMatchObject({
				type: "launch",
				reuse: { branch: candidate.expected, source: candidate.source },
				launch: { type: "launched" },
			});
			expect(subject.checkoutCommands).toEqual([`git checkout ${candidate.expected}`]);
			expect(subject.parentSessions).toEqual(["/sessions/source.jsonl"]);
			expect(subject.replacementMessages).toEqual([
				`/ns:branch-context:impl-attached-plan ${candidate.expected}-target-plan.md`,
			]);
		}
	});

	test("dry-run reports provider skipped without checkout or session mutation", async () => {
		const subject = fixture([{ branch: "explicit", key: "explicit-target-plan.md" }]);
		const result = await runDormantGsExistingBranchContextReuse({
			...options(subject),
			branchName: "explicit",
			dryRun: true,
		});

		expect(result.type).toBe("dry-run");
		if (result.type !== "dry-run") throw new Error("expected dry-run result");
		expect(result.message).toContain("Topology action: provider skipped");
		expect(result.message).toContain("git checkout explicit");
		expect(result.message).toContain("/new (with parent-session evidence)");
		expect(result.message).toContain(
			"/ns:branch-context:impl-attached-plan explicit-target-plan.md",
		);
		expect(subject.checkoutCommands).toEqual([]);
		expect(subject.parentSessions).toEqual([]);
		expect(subject.replacementMessages).toEqual([]);
	});

	test("returns checkout failure with the old reused-plan recovery diagnostic", async () => {
		const subject = fixture([{ branch: "current", key: "current-target-plan.md" }], "current", {
			checkout: { ok: false, error: { code: "checkout", message: "checkout failed" } },
		});
		const result = await runDormantGsExistingBranchContextReuse({
			...options(subject),
			dryRun: false,
		});

		expect(result).toEqual({
			type: "launch",
			reuse: expect.objectContaining({ branch: "current", key: "current-target-plan.md" }),
			launch: {
				type: "checkout-failed",
				branch: "current",
				key: "current-target-plan.md",
				message: "checkout failed",
			},
		});
		expect(subject.parentSessions).toEqual([]);
		expect(subject.notices.at(-1)?.message).toBe(
			"Reused Attached Plan, but exact checkout failed.\nTarget: current\nKey: current-target-plan.md\nRecovery: git checkout 'current' then run /ns:branch-context:impl-attached-plan current-target-plan.md\ncheckout failed",
		);
	});

	test("returns cancellation with the old manual continuation diagnostic", async () => {
		const subject = fixture([{ branch: "current", key: "current-target-plan.md" }], "current", {
			cancelled: true,
		});
		const result = await runDormantGsExistingBranchContextReuse({
			...options(subject),
			dryRun: false,
		});

		expect(result).toMatchObject({
			type: "launch",
			launch: { type: "cancelled", branch: "current", key: "current-target-plan.md" },
		});
		expect(subject.notices.at(-1)?.message).toBe(
			"Fresh session was cancelled; current remains checked out. Run /ns:branch-context:impl-attached-plan current-target-plan.md to continue.",
		);
	});

	test("returns pre-activation session failure with the old recovery diagnostic", async () => {
		const subject = fixture([{ branch: "current", key: "current-target-plan.md" }], "current", {
			newSessionFailure: new Error("replacement unavailable"),
		});
		const result = await runDormantGsExistingBranchContextReuse({
			...options(subject),
			dryRun: false,
		});

		expect(result).toMatchObject({
			type: "launch",
			launch: {
				type: "new-session-failed",
				branch: "current",
				key: "current-target-plan.md",
				message: "replacement unavailable",
			},
		});
		expect(subject.notices.at(-1)?.message).toBe(
			"Fresh session failed before activation; current remains checked out.\nTarget: current\nKey: current-target-plan.md\nRecovery: run /ns:branch-context:impl-attached-plan current-target-plan.md\nreplacement unavailable",
		);
	});

	test("preserves ambiguity and verification failures without launch", async () => {
		const subject = fixture([]);
		await expect(
			runDormantGsExistingBranchContextReuse({
				...options(subject),
				sessionEntries: [sessionEntry("one", "one.md"), sessionEntry("two", "two.md")],
				dryRun: false,
			}),
		).rejects.toThrow("Multiple existing branch-context candidates");
		await expect(
			runDormantGsExistingBranchContextReuse({
				...options(subject),
				branchName: "missing",
				dryRun: false,
			}),
		).rejects.toThrow("No existing branch context with an attached plan could be reused");
		expect(subject.checkoutCommands).toEqual([]);
		expect(subject.parentSessions).toEqual([]);
	});
});
