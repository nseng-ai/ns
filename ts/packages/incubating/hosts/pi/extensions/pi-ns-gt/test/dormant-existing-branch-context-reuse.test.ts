import { describe, expect, test } from "vitest";

import { BRANCH_CONTEXT_NAMESPACE, type BranchContextContext } from "@nseng-ai/branch-context/api";
import { BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE } from "@nseng-ai/branch-context";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type {
	BranchContextGtUpstackImplContext,
	BranchContextGtUpstackImplNewSessionOptions,
} from "../src/gt/upstack-impl-launch.ts";
import { runDormantGtExistingBranchContextReuse } from "../src/dormant-existing-branch-context-reuse.ts";

const pi: CommandExecApi = {
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

function fixture(entries: Array<{ branch: string; key: string }>, currentBranch = "current") {
	const git = new InMemoryGitGateway({ currentBranch });
	const brmem = new InMemoryBranchMemoryGateway({ entries });
	const context: BranchContextContext = { commands: pi, git, brmem };
	const checkoutCommands: string[] = [];
	const checkoutGit = {
		async checkout(input: { branch: string }) {
			checkoutCommands.push(`git checkout ${input.branch}`);
			return { ok: true } as const;
		},
	};
	const replacementMessages: string[] = [];
	const parentSessions: Array<string | undefined> = [];
	const launchContext: BranchContextGtUpstackImplContext = {
		cwd: "/repo",
		hasUI: true,
		ui: { setStatus() {} },
		sessionManager: { getSessionFile: () => "/sessions/source.jsonl" },
		async newSession(options?: BranchContextGtUpstackImplNewSessionOptions) {
			parentSessions.push(options?.parentSession);
			await options?.withSession?.({
				cwd: "/repo",
				hasUI: true,
				ui: { notify() {}, setStatus() {} },
				async waitForIdle() {},
				async newSession() {
					return { cancelled: false };
				},
				sendMessage() {},
				async sendUserMessage(message: string) {
					replacementMessages.push(message);
				},
			});
			return { cancelled: false };
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

describe("private dormant GT existing-branch reuse orchestration", () => {
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
			const result = await runDormantGtExistingBranchContextReuse({
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

	test("dry-run preserves old formatting without checkout or session mutation", async () => {
		const subject = fixture([{ branch: "explicit", key: "explicit-target-plan.md" }]);
		const result = await runDormantGtExistingBranchContextReuse({
			...options(subject),
			branchName: "explicit",
			dryRun: true,
		});

		expect(result.type).toBe("dry-run");
		if (result.type !== "dry-run") throw new Error("expected dry-run result");
		expect(result.message).toContain("Existing branch context with attached plan:");
		expect(result.message).toContain(
			"git checkout explicit\n/new\n/ns:branch-context:impl-attached-plan explicit-target-plan.md",
		);
		expect(subject.checkoutCommands).toEqual([]);
		expect(subject.parentSessions).toEqual([]);
		expect(subject.replacementMessages).toEqual([]);
	});

	test("preserves ambiguity and verification failures without launch", async () => {
		const subject = fixture([]);
		await expect(
			runDormantGtExistingBranchContextReuse({
				...options(subject),
				sessionEntries: [sessionEntry("one", "one.md"), sessionEntry("two", "two.md")],
				dryRun: false,
			}),
		).rejects.toThrow("Multiple existing branch-context candidates");
		await expect(
			runDormantGtExistingBranchContextReuse({
				...options(subject),
				branchName: "missing",
				dryRun: false,
			}),
		).rejects.toThrow("No existing branch context with an attached plan could be reused");
		expect(subject.checkoutCommands).toEqual([]);
		expect(subject.parentSessions).toEqual([]);
	});
});
