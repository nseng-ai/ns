import { describe, expect, test } from "vitest";

import type { CommandExecApi } from "@asdl/core/exec";
import { InMemoryGitGateway } from "@asdl/core/git/testing";

import { PLAN_BRANCH_NAMESPACE, PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE, resolveExistingPlannedBranchReuse } from "@asdl/planned-branch";
import { InMemoryPlannedBranchBrmemGateway } from "./support/in-memory-brmem-gateway.ts";

const CWD = "/repo";
const SESSION_BRANCH = "planned-branches/session-target";
const SESSION_KEY = "session-target.md";
const CURRENT_BRANCH = "planned-branches/current-target";
const CURRENT_KEY = "current-target.md";

const pi: CommandExecApi = {
	exec: async () => {
		throw new Error("unexpected exec call; gateways are injected in these tests");
	},
};

function sessionEntry(branch: string, key: string): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
			display: true,
			content: "Created planned branch and attached plan.",
			details: {
				status: "success",
				evidence: {
					slug: key.replace(/\.md$/, ""),
					branch,
					branchCreation: "graphite",
					startPoint: "0123456789abcdef0123456789abcdef01234567",
					namespace: PLAN_BRANCH_NAMESPACE,
					key,
					refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`,
					commit: "abc123",
					sourceFile: `/tmp/${key}`,
				},
			},
		},
	};
}

describe("resolveExistingPlannedBranchReuse", () => {
	test("verifies an explicit branch without touching git", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway({ entries: [{ branch: "planned-branches/explicit", key: "explicit.md" }] });
		const git = new InMemoryGitGateway();

		const reuse = await resolveExistingPlannedBranchReuse(pi, { explicitBranch: "planned-branches/explicit" }, { cwd: CWD, git, brmem });

		expect(reuse).toEqual({ branch: "planned-branches/explicit", key: "explicit.md", source: "explicit-branch" });
		expect(brmem.listAttachedPlansCalls).toEqual([{ cwd: CWD, branch: "planned-branches/explicit" }]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("fails an explicit branch without falling back to the current branch", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		await expect(resolveExistingPlannedBranchReuse(pi, { explicitBranch: "planned-branches/empty" }, { cwd: CWD, git, brmem })).rejects.toThrow(
			/No existing planned branch with an attached plan could be reused\.[\s\S]*planned-branches\/empty/,
		);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("verifies a single session candidate without touching git", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway({ entries: [{ branch: SESSION_BRANCH, key: SESSION_KEY }] });
		const git = new InMemoryGitGateway();

		const reuse = await resolveExistingPlannedBranchReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, git, brmem },
		);

		expect(reuse).toEqual({ branch: SESSION_BRANCH, key: SESSION_KEY, source: "session-output" });
		expect(brmem.listAttachedPlansCalls).toEqual([{ cwd: CWD, branch: SESSION_BRANCH }]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("rejects ambiguous session candidates before any gateway I/O", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const git = new InMemoryGitGateway();

		await expect(
			resolveExistingPlannedBranchReuse(
				pi,
				{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY), sessionEntry("planned-branches/other", "other.md")] },
				{ cwd: CWD, git, brmem },
			),
		).rejects.toThrow(/Multiple existing planned-branch candidates were found in this session\.[\s\S]*--branch <target-branch>/);

		expect(brmem.listAttachedPlansCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([]);
	});

	test("falls through to the current branch when the session candidate fails verification", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway({ entries: [{ branch: CURRENT_BRANCH, key: CURRENT_KEY }] });
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		const reuse = await resolveExistingPlannedBranchReuse(
			pi,
			{ sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] },
			{ cwd: CWD, git, brmem },
		);

		expect(reuse).toEqual({ branch: CURRENT_BRANCH, key: CURRENT_KEY, source: "current-branch" });
		expect(brmem.listAttachedPlansCalls).toEqual([
			{ cwd: CWD, branch: SESSION_BRANCH },
			{ cwd: CWD, branch: CURRENT_BRANCH },
		]);
		expect(git.currentBranchCalls).toHaveLength(1);
	});

	test("aggregates session and current-branch verification failures into one error", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: CURRENT_BRANCH });

		const promise = resolveExistingPlannedBranchReuse(pi, { sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] }, { cwd: CWD, git, brmem });

		await expect(promise).rejects.toThrow(
			/No existing planned branch with an attached plan could be reused\.[\s\S]*session-target[\s\S]*current-target/,
		);
	});

	test("reports an unresolvable current branch alongside the session failure", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const promise = resolveExistingPlannedBranchReuse(pi, { sessionEntries: [sessionEntry(SESSION_BRANCH, SESSION_KEY)] }, { cwd: CWD, git, brmem });

		await expect(promise).rejects.toThrow(/session-target[\s\S]*could not resolve current branch:/);
	});

	test("reports only the current-branch resolution failure when no session candidates exist", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const promise = resolveExistingPlannedBranchReuse(pi, {}, { cwd: CWD, git, brmem });

		await expect(promise).rejects.toThrow(/No existing planned branch with an attached plan could be reused\.[\s\S]*could not resolve current branch:/);
		expect(brmem.listAttachedPlansCalls).toEqual([]);
	});
});
