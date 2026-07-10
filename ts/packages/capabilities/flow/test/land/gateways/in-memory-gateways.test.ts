import { describe, expect, test } from "vitest";

import {
	createInMemoryLandContext,
	InMemoryLandGitGateway,
	InMemoryLandGithubPrGateway,
	InMemoryLandGraphiteGateway,
	InMemoryLandWorktreeSlotFactsGateway,
	pullRequestFacts,
	stackSnapshot,
} from "@nseng-ai/flow/land/testing";

import type { LocalBranchTip, ManagedSlotWorktree, WorktreeEntry } from "@nseng-ai/flow/land/api";

const REPO_ROOT = "/repo";
const FEATURE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("@nseng-ai/flow land in-memory gateway fakes", () => {
	test("assembles a land context from semantic constructor state", async () => {
		const { context, git, graphite, github, worktrees } = createInMemoryLandContext({
			git: {
				repoRoot: REPO_ROOT,
				currentBranch: "feature/land-core",
				localBranches: [
					{ name: "feature/land-core", sha: FEATURE_SHA },
					{ name: "feature/child", sha: CHILD_SHA },
				],
			},
			graphite: {
				trunk: "main",
				stackShape: stackSnapshot({
					current: "feature/land-core",
					landingBranches: ["feature/land-core"],
					descendantBranches: ["feature/child"],
				}),
			},
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 42,
						headRefName: "feature/land-core",
						headRefOid: FEATURE_SHA,
						url: "https://github.example/pr/42",
					}),
				],
			},
			worktrees: {
				worktrees: [{ path: "/repo-slot", branch: "feature/child" }],
				classifications: { "/repo-slot": { type: "managed-slot", slotName: "slot-02" } },
			},
		});

		expect(await context.git.resolveRepoRoot({ cwd: "/repo/subdir" })).toEqual({
			type: "success",
			value: REPO_ROOT,
		});
		expect(await context.git.currentBranch({ repoRoot: REPO_ROOT })).toEqual({
			type: "success",
			value: "feature/land-core",
		});
		expect(
			await context.graphite.stackShape({
				repoRoot: REPO_ROOT,
				metadataDbPath: "/repo/.git/graphite.db",
				current: "feature/land-core",
				trunk: "main",
				liveLocalBranches: ["feature/land-core", "feature/child"],
			}),
		).toMatchObject({
			type: "success",
			value: { current: "feature/land-core", descendantBranches: ["feature/child"] },
		});
		expect(
			await context.github.pullRequestFacts({ repoRoot: REPO_ROOT, branchOrNumber: "42" }),
		).toMatchObject({
			type: "success",
			value: { number: 42, state: "OPEN", headRefName: "feature/land-core" },
		});
		expect(
			await context.github.squashMergePullRequest({
				repoRoot: REPO_ROOT,
				pullRequest: pullRequestFacts({
					number: 42,
					headRefName: "feature/land-core",
					headRefOid: FEATURE_SHA,
				}),
			}),
		).toEqual({ type: "success", value: { stdout: "", stderr: "" } });
		expect(
			await context.git.snapshotBackupRefs({
				repoRoot: REPO_ROOT,
				branches: ["feature/land-core", "feature/child"],
			}),
		).toEqual({
			type: "success",
			value: new Map([
				["feature/land-core", FEATURE_SHA],
				["feature/child", CHILD_SHA],
			]),
		});
		expect(
			await context.worktrees.classifyWorktree({
				repoRoot: REPO_ROOT,
				path: "/repo-slot",
				branch: "feature/child",
			}),
		).toEqual({ type: "success", value: { type: "managed-slot", slotName: "slot-02" } });
		expect(
			await context.worktrees.freeSlots({
				repoRoot: REPO_ROOT,
				slots: [{ type: "managed-slot", branch: "feature/child", path: "/repo-slot" }],
			}),
		).toEqual({
			type: "success",
			value: [{ type: "managed-slot", branch: "feature/child", path: "/repo-slot" }],
		});

		expect(git.resolveRepoRootCalls).toEqual([{ cwd: "/repo/subdir" }]);
		expect(graphite.stackShapeCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				metadataDbPath: "/repo/.git/graphite.db",
				current: "feature/land-core",
				trunk: "main",
				liveLocalBranches: ["feature/land-core", "feature/child"],
			},
		]);
		expect(github.pullRequestFactsCalls).toEqual([{ repoRoot: REPO_ROOT, branchOrNumber: "42" }]);
		expect(github.squashMergePullRequestCalls).toMatchObject([
			{ repoRoot: REPO_ROOT, pullRequest: { number: 42, headRefName: "feature/land-core" } },
		]);
		expect(git.snapshotBackupRefsCalls).toEqual([
			{ repoRoot: REPO_ROOT, branches: ["feature/land-core", "feature/child"] },
		]);
		expect(worktrees.classifyWorktreeCalls).toEqual([
			{ repoRoot: REPO_ROOT, path: "/repo-slot", branch: "feature/child" },
		]);
		expect(worktrees.freeSlotsCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				slots: [{ type: "managed-slot", branch: "feature/child", path: "/repo-slot" }],
			},
		]);
	});

	test("models preflight non-ideal states without scripted argv mocks", async () => {
		const git = new InMemoryLandGitGateway({
			workingTreeStatus: { isClean: false, inProgressOperation: "rebase" },
			localBranches: [{ name: "feature/land-core", sha: FEATURE_SHA }],
			branchContainsParents: { "feature/child|feature/land-core": false },
		});
		const github = new InMemoryLandGithubPrGateway({
			pullRequests: [
				pullRequestFacts({ number: 7, headRefName: "feature/closed", state: "CLOSED" }),
			],
		});
		const worktrees = new InMemoryLandWorktreeSlotFactsGateway({
			worktrees: [
				{ path: "/repo-slot", branch: "feature/land-core" },
				{ path: "/manual", branch: "feature/child" },
			],
			classifications: {
				"/repo-slot": { type: "managed-slot", slotName: "slot-02" },
				"/manual": { type: "manual-worktree" },
			},
		});
		const graphite = new InMemoryLandGraphiteGateway({
			submitUpdateResults: {
				"feature/land-core": {
					type: "failure",
					failure: {
						type: "boundary",
						phase: "submit-preparation",
						source: "graphite",
						code: "submit_required",
						message: "Submit update required before landing.",
						displayCommand: "gt submit --update",
						execResult: {
							stdout: "",
							stderr: "submit failed",
							code: 1,
							type: "exited",
							signal: null,
						},
						suggestedAction: "Run gt submit --update manually.",
					},
				},
			},
			restackForSubmitResults: {
				"feature/child": {
					type: "failure",
					failure: {
						type: "boundary",
						phase: "submit-preparation",
						source: "graphite",
						code: "restack_required",
						message: "Restack required before submit.",
					},
				},
			},
		});

		expect(await git.workingTreeStatus({ repoRoot: REPO_ROOT })).toEqual({
			type: "success",
			value: { isClean: false, inProgressOperation: "rebase" },
		});
		expect(
			await git.localBranchExists({ repoRoot: REPO_ROOT, branch: "feature/missing" }),
		).toMatchObject({
			type: "failure",
			failure: { type: "domain", reason: "local-branch-missing", failedBranch: "feature/missing" },
		});
		expect(
			await git.branchContainsParent({
				repoRoot: REPO_ROOT,
				branch: "feature/child",
				parent: "feature/land-core",
			}),
		).toEqual({ type: "success", value: false });
		expect(
			await github.pullRequestFacts({ repoRoot: REPO_ROOT, branchOrNumber: "feature/missing" }),
		).toMatchObject({
			type: "failure",
			failure: { type: "boundary", source: "github", code: "pull_request_missing" },
		});
		expect(
			await github.pullRequestFacts({ repoRoot: REPO_ROOT, branchOrNumber: "feature/closed" }),
		).toMatchObject({
			type: "success",
			value: { state: "CLOSED" },
		});
		expect(await worktrees.worktrees({ repoRoot: REPO_ROOT })).toEqual({
			type: "success",
			value: [
				{ path: "/repo-slot", branch: "feature/land-core" },
				{ path: "/manual", branch: "feature/child" },
			],
		});
		expect(
			await worktrees.classifyWorktree({
				repoRoot: REPO_ROOT,
				path: "/manual",
				branch: "feature/child",
			}),
		).toEqual({
			type: "success",
			value: { type: "manual-worktree" },
		});
		expect(
			await graphite.prepareSubmitUpdate({ repoRoot: REPO_ROOT, branch: "feature/land-core" }),
		).toEqual({
			type: "failure",
			failure: {
				type: "boundary",
				phase: "submit-preparation",
				source: "graphite",
				code: "submit_required",
				message: "Submit update required before landing.",
				displayCommand: "gt submit --update",
				execResult: {
					stdout: "",
					stderr: "submit failed",
					code: 1,
					type: "exited",
					signal: null,
				},
				suggestedAction: "Run gt submit --update manually.",
			},
		});
		expect(
			await graphite.prepareRestackForSubmit({ repoRoot: REPO_ROOT, branch: "feature/child" }),
		).toMatchObject({
			type: "failure",
			failure: { code: "restack_required" },
		});
		expect(graphite.prepareSubmitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature/land-core" },
		]);
		expect(graphite.prepareRestackForSubmitCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature/child" },
		]);
	});

	test("copies mutable collections on input and output", async () => {
		const localBranches: LocalBranchTip[] = [{ name: "feature/land-core", sha: FEATURE_SHA }];
		const worktreeEntries: WorktreeEntry[] = [{ path: "/repo-slot", branch: "feature/land-core" }];
		const slotsToFree: ManagedSlotWorktree[] = [
			{ type: "managed-slot", branch: "feature/land-core", path: "/repo-slot" },
		];
		const stack = stackSnapshot({ landingBranches: ["feature/land-core"] });
		const git = new InMemoryLandGitGateway({ localBranches });
		const graphite = new InMemoryLandGraphiteGateway({ stackShape: stack });
		const worktrees = new InMemoryLandWorktreeSlotFactsGateway({ worktrees: worktreeEntries });

		localBranches.push({ name: "feature/late", sha: CHILD_SHA });
		worktreeEntries.push({ path: "/late", branch: "feature/late" });
		const mutableLandingBranches = stack.landingBranches as string[];
		mutableLandingBranches.push("feature/late");

		const listedBranches = await git.listLocalBranches({ repoRoot: REPO_ROOT });
		const listedWorktrees = await worktrees.worktrees({ repoRoot: REPO_ROOT });
		const freedSlots = await worktrees.freeSlots({ repoRoot: REPO_ROOT, slots: slotsToFree });
		const firstStackShape = await graphite.stackShape({
			repoRoot: REPO_ROOT,
			metadataDbPath: "/repo/.git/graphite.db",
			current: "feature/land-core",
			trunk: "main",
			liveLocalBranches: ["feature/land-core"],
		});

		expect(listedBranches).toEqual({
			type: "success",
			value: [{ name: "feature/land-core", sha: FEATURE_SHA }],
		});
		expect(listedWorktrees).toEqual({
			type: "success",
			value: [{ path: "/repo-slot", branch: "feature/land-core" }],
		});
		expect(freedSlots).toEqual({
			type: "success",
			value: [{ type: "managed-slot", branch: "feature/land-core", path: "/repo-slot" }],
		});
		expect(firstStackShape).toMatchObject({
			type: "success",
			value: { landingBranches: ["feature/land-core"] },
		});

		if (listedBranches.type === "success") {
			const mutableBranches = listedBranches.value as LocalBranchTip[];
			mutableBranches.push({ name: "feature/output-mutation", sha: CHILD_SHA });
		}
		if (listedWorktrees.type === "success") {
			const mutableReturnedWorktrees = listedWorktrees.value as WorktreeEntry[];
			mutableReturnedWorktrees.push({ path: "/output-mutation" });
		}
		if (freedSlots.type === "success") {
			const mutableReturnedSlots = freedSlots.value as ManagedSlotWorktree[];
			mutableReturnedSlots.push({
				type: "managed-slot",
				branch: "feature/output-mutation",
				path: "/output-mutation",
			});
		}
		if (firstStackShape.type === "success") {
			const mutableReturnedLandingBranches = firstStackShape.value.landingBranches as string[];
			mutableReturnedLandingBranches.push("feature/output-mutation");
		}

		expect(await git.listLocalBranches({ repoRoot: REPO_ROOT })).toEqual({
			type: "success",
			value: [{ name: "feature/land-core", sha: FEATURE_SHA }],
		});
		expect(await worktrees.worktrees({ repoRoot: REPO_ROOT })).toEqual({
			type: "success",
			value: [{ path: "/repo-slot", branch: "feature/land-core" }],
		});
		expect(await worktrees.freeSlots({ repoRoot: REPO_ROOT, slots: slotsToFree })).toEqual({
			type: "success",
			value: [{ type: "managed-slot", branch: "feature/land-core", path: "/repo-slot" }],
		});
		expect(
			await graphite.stackShape({
				repoRoot: REPO_ROOT,
				metadataDbPath: "/repo/.git/graphite.db",
				current: "feature/land-core",
				trunk: "main",
				liveLocalBranches: ["feature/land-core"],
			}),
		).toMatchObject({
			type: "success",
			value: { landingBranches: ["feature/land-core"] },
		});
	});
});
