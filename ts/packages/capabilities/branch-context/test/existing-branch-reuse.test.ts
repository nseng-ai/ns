import { describe, expect, test } from "vitest";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import {
	BRANCH_CONTEXT_NAMESPACE,
	BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
	resolveExistingBranchContextReuse,
} from "@nseng-ai/branch-context";
import type { BranchContextContext } from "../src/core/context.ts";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/testing";

const CWD = "/repo";
const SESSION_BRANCH = "branch-contexts/session-target";
const SESSION_KEY = "session-target-plan.md";
const LEGACY_SESSION_KEY = "plan.md";
const CURRENT_BRANCH = "branch-contexts/current-target";
const CURRENT_KEY = "current-target-plan.md";

const pi: CommandExecApi = {
	exec: async () => {
		throw new Error("unexpected exec call; gateways are injected in these tests");
	},
};

function branchContext(
	overrides: Pick<BranchContextContext, "git" | "brmem">,
): BranchContextContext {
	return {
		commands: pi,
		git: overrides.git,
		brmem: overrides.brmem,
		graphite: new InMemoryGraphiteBranchGateway(),
	};
}

function sessionEntry(branch: string, key: string): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
			display: true,
			content: "Created branch context and attached plan.",
			details: {
				status: "success",
				evidence: {
					slug: key.replace(/\.md$/, ""),
					branch,
					branchCreation: "graphite",
					startPoint: "0123456789abcdef0123456789abcdef01234567",
					namespace: BRANCH_CONTEXT_NAMESPACE,
					key,
					refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`,
					commit: "abc123",
					sourceFile: `/tmp/${key}`,
				},
			},
		},
	};
}

describe("resolveExistingBranchContextReuse", () => {
	test("verifies an explicit branch without touching git", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: "branch-contexts/explicit", key: "explicit-target-plan.md" }],
		});
		const git = new InMemoryGitGateway();

		const reuse = await resolveExistingBranchContextReuse(
			pi,
			{ explicitBranch: "branch-contexts/explicit" },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		expect(reuse).toEqual({
			branch: "branch-contexts/explicit",
			key: "explicit-target-plan.md",
			source: "explicit-branch",
		});
		expect(brmem.listAttachedPlansCalls).toEqual([{ branch: "branch-contexts/explicit" }]);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("fails an explicit branch without falling back to the current branch", async () => {
		const brmem = new InMemoryBranchMemoryGateway();
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		await expect(
			resolveExistingBranchContextReuse(
				pi,
				{ explicitBranch: "branch-contexts/empty" },
				{ cwd: CWD, context: branchContext({ git, brmem }) },
			),
		).rejects.toThrow(
			/No existing branch context with an attached plan could be reused\.[\s\S]*branch-contexts\/empty/,
		);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("verifies a single session candidate without touching git", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: SESSION_BRANCH, key: SESSION_KEY }],
		});
		const git = new InMemoryGitGateway();

		const reuse = await resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		expect(reuse).toEqual({ branch: SESSION_BRANCH, key: SESSION_KEY, source: "session-output" });
		expect(brmem.attachmentPresenceCalls).toEqual([{ branch: SESSION_BRANCH, key: SESSION_KEY }]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("rejects legacy plan.md session candidates before presence verification", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: SESSION_BRANCH, key: LEGACY_SESSION_KEY }],
		});
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const promise = resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, LEGACY_SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		await expect(promise).rejects.toThrow(
			/Legacy branch-context key plan\.md is no longer supported/,
		);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
	});

	test("falls through to the current branch when legacy plan.md session evidence is rejected", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [
				{ branch: SESSION_BRANCH, key: LEGACY_SESSION_KEY },
				{ branch: CURRENT_BRANCH, key: CURRENT_KEY },
			],
		});
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		const reuse = await resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, LEGACY_SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		expect(reuse).toEqual({ branch: CURRENT_BRANCH, key: CURRENT_KEY, source: "current-branch" });
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.listAttachedPlansCalls).toEqual([{ branch: CURRENT_BRANCH }]);
	});

	test("rejects ambiguous session candidates before any gateway I/O", async () => {
		const brmem = new InMemoryBranchMemoryGateway();
		const git = new InMemoryGitGateway();

		await expect(
			resolveExistingBranchContextReuse(
				pi,
				{
					sessionEntries: [
						sessionEntry(SESSION_BRANCH, SESSION_KEY),
						sessionEntry("branch-contexts/other", "other-target-plan.md"),
					],
				},
				{ cwd: CWD, context: branchContext({ git, brmem }) },
			),
		).rejects.toThrow(
			/Multiple existing branch-context candidates were found in this session\.[\s\S]*--branch <target-branch>/,
		);

		expect(brmem.listAttachedPlansCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("falls through to the current branch when the session candidate fails verification", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: CURRENT_BRANCH, key: CURRENT_KEY }],
		});
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		const reuse = await resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		expect(reuse).toEqual({ branch: CURRENT_BRANCH, key: CURRENT_KEY, source: "current-branch" });
		expect(brmem.attachmentPresenceCalls).toEqual([{ branch: SESSION_BRANCH, key: SESSION_KEY }]);
		expect(brmem.listAttachedPlansCalls).toEqual([{ branch: CURRENT_BRANCH }]);
		expect(git.currentBranchCalls).toHaveLength(1);
	});

	test("aggregates session and current-branch verification failures into one error", async () => {
		const brmem = new InMemoryBranchMemoryGateway();
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		const promise = resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		await expect(promise).rejects.toThrow(
			/No existing branch context with an attached plan could be reused\.[\s\S]*session-target[\s\S]*current-target/,
		);
	});

	test("reports an unresolvable current branch alongside the session failure", async () => {
		const brmem = new InMemoryBranchMemoryGateway();
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const promise = resolveExistingBranchContextReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		await expect(promise).rejects.toThrow(/session-target[\s\S]*could not resolve current branch:/);
	});

	test("reports only the current-branch resolution failure when no session candidates exist", async () => {
		const brmem = new InMemoryBranchMemoryGateway();
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const promise = resolveExistingBranchContextReuse(
			pi,
			{},
			{ cwd: CWD, context: branchContext({ git, brmem }) },
		);

		await expect(promise).rejects.toThrow(
			/No existing branch context with an attached plan could be reused\.[\s\S]*could not resolve current branch:/,
		);
		expect(brmem.listAttachedPlansCalls).toEqual([]);
	});
});
