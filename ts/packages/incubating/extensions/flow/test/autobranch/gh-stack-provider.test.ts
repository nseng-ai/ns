import { describe, expect, test } from "vitest";

import { createAutobranchGitGateway } from "../../src/autobranch/git-gateway.ts";
import { createGhStackAutobranchProvider } from "../../src/autobranch/provider.ts";
import { fail, ok } from "./autobranch-test-helpers.ts";

const trackedSource = JSON.stringify({
	trunk: "main",
	currentBranch: "feature",
	branches: [
		{
			name: "feature",
			isCurrent: true,
			isMerged: false,
			isQueued: false,
			needsRebase: false,
		},
	],
});

function childTopology() {
	return JSON.stringify({
		trunk: "main",
		currentBranch: "child",
		branches: [
			{
				name: "feature",
				head: "abc123",
				base: "parent",
				isCurrent: false,
				isMerged: false,
				isQueued: false,
				needsRebase: false,
			},
			{
				name: "child",
				isCurrent: true,
				isMerged: false,
				isQueued: false,
				needsRebase: false,
			},
		],
	});
}

describe("github/gh-stack autobranch adapter", () => {
	test("distinguishes an absent branch from a repository failure", async () => {
		const absentExec = async (command: string, args: string[]) =>
			command === "git" && args[0] === "show-ref" ? fail("", 1) : ok();
		const failedExec = async (command: string, args: string[]) =>
			command === "git" && args[0] === "show-ref" ? fail("fatal: not a git repository", 128) : ok();

		expect(
			await createAutobranchGitGateway({ cwd: "/repo", exec: absentExec }).branchSha("missing"),
		).toEqual({ type: "absent" });
		expect(
			await createAutobranchGitGateway({ cwd: "/repo", exec: failedExec }).branchSha("missing"),
		).toEqual({ type: "error", details: "exit code 128: fatal: not a git repository" });
	});

	test("validates view JSON before exposing topology", async () => {
		const exec = async (command: string, args: string[]) =>
			command === "gh" && args.join(" ") === "stack view --json" ? ok("not-json") : ok();
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });

		expect(await provider.inspectSource("feature")).toEqual({
			type: "failed",
			error: "gh stack view --json returned malformed JSON.",
		});
	});

	test.each([
		["command failure", fail("view exploded"), "exit code 1: view exploded"],
		[
			"missing current",
			ok('{"trunk":"main","currentBranch":"feature","branches":[]}'),
			"inconsistent current-branch topology",
		],
		[
			"inconsistent current",
			ok(
				JSON.stringify({
					trunk: "main",
					currentBranch: "feature",
					branches: [
						{
							name: "other",
							head: "abc123",
							base: "parent",
							isCurrent: true,
							isMerged: false,
							isQueued: false,
							needsRebase: false,
						},
					],
				}),
			),
			"inconsistent current-branch topology",
		],
	])("classifies %s view results", async (_label, viewResult, expectedError) => {
		const exec = async () => viewResult;
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });
		const result = await provider.inspectSource("feature");
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.error).toContain(expectedError);
	});

	test.each([
		[
			"duplicate branches",
			{
				trunk: "main",
				currentBranch: "feature",
				branches: [
					{
						name: "feature",
						head: "abc123",
						base: "parent",
						isCurrent: true,
						isMerged: false,
						isQueued: false,
						needsRebase: false,
					},
					{
						name: "feature",
						head: "def456",
						base: "abc123",
						isCurrent: false,
						isMerged: false,
						isQueued: false,
						needsRebase: false,
					},
				],
			},
			"duplicate branches",
		],
	] as const)("rejects %s", async (_label, topology, expectedError) => {
		const exec = async () => ok(JSON.stringify(topology));
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });
		const result = await provider.inspectSource(topology.currentBranch);
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.error).toContain(expectedError);
	});

	test("refuses an untracked Git trunk before init", async () => {
		const calls: string[] = [];
		const exec = async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (command === "gh") return fail('current branch "main" is not part of a stack');
			if (args.join(" ") === "symbolic-ref --short refs/remotes/origin/HEAD") {
				return ok("origin/main\n");
			}
			return ok();
		};
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });

		expect(await provider.prepareSource("main")).toEqual({
			type: "refused-trunk",
			branch: "main",
			trunk: "main",
		});
		expect(calls.some((call) => call.startsWith("gh stack init"))).toBe(false);
	});

	test("initializes an untracked non-trunk source and re-inspects it", async () => {
		const calls: string[] = [];
		let initialized = false;
		const exec = async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (command === "gh" && args.join(" ") === "stack view --json") {
				return initialized
					? ok(trackedSource)
					: fail('current branch "feature" is not part of a stack');
			}
			if (command === "gh" && args.join(" ") === "stack init feature") {
				initialized = true;
				return ok();
			}
			if (command === "git") return ok("origin/main\n");
			return ok();
		};
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });
		expect(await provider.preflightSource("feature")).toEqual({
			type: "ready",
			initialized: false,
		});
		expect(await provider.prepareSource("feature")).toEqual({ type: "ready", initialized: true });
		expect(calls).toContain("gh stack init feature");
	});

	test("reports potential retained initialization after a nonzero init", async () => {
		const exec = async (command: string, args: string[]) => {
			if (command === "gh" && args.join(" ") === "stack view --json") {
				return fail('current branch "feature" is not part of a stack');
			}
			if (command === "gh" && args.join(" ") === "stack init feature") {
				return fail("init failed after enabling rerere");
			}
			return ok("origin/main\n");
		};
		const provider = createGhStackAutobranchProvider({
			exec,
			git: createAutobranchGitGateway({ cwd: "/repo", exec }),
		});

		expect(await provider.prepareSource("feature")).toEqual({
			type: "failed",
			error: expect.stringContaining("may have retained rerere or stack metadata"),
			initialized: true,
		});
	});

	test("uses plain gh stack add and verifies Git plus topology", async () => {
		const calls: string[] = [];
		let viewCount = 0;
		const exec = async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (command === "gh" && args.join(" ") === "stack view --json") {
				viewCount += 1;
				return ok(viewCount === 1 ? trackedSource : childTopology());
			}
			if (command === "gh" && args.join(" ") === "stack add child") return ok();
			if (command === "git" && args.join(" ") === "branch --show-current") return ok("child\n");
			if (command === "git" && args[0] === "show-ref") return ok();
			if (command === "git" && args.join(" ") === "rev-parse --verify refs/heads/feature") {
				return ok("abc123\n");
			}
			if (command === "git" && args.join(" ") === "rev-parse --verify refs/heads/child") {
				return ok("abc123\n");
			}
			return ok();
		};
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });
		expect(await provider.prepareSource("feature")).toEqual({ type: "ready", initialized: false });
		expect(
			await provider.addChild({
				sourceBranch: "feature",
				childBranch: "child",
				expectedSourceSha: "abc123",
				expectedChildSha: "abc123",
				initialized: false,
			}),
		).toEqual({ type: "verified", initialized: false });
		expect(calls).toContain("gh stack add child");
		expect(calls.some((call) => call.includes("stack add child -"))).toBe(false);
	});

	test("rejects a child that is topmost but not directly above the requested source", async () => {
		const topology = JSON.stringify({
			trunk: "main",
			currentBranch: "child",
			branches: [
				{
					name: "feature",
					head: "abc123",
					base: "parent",
					isCurrent: false,
					isMerged: false,
					isQueued: false,
					needsRebase: false,
				},
				{
					name: "intervening",
					head: "def456",
					base: "abc123",
					isCurrent: false,
					isMerged: false,
					isQueued: false,
					needsRebase: false,
				},
				{
					name: "child",
					head: "abc123",
					base: "def456",
					isCurrent: true,
					isMerged: false,
					isQueued: false,
					needsRebase: false,
				},
			],
		});
		const exec = async (command: string, args: string[]) => {
			if (command === "gh" && args.join(" ") === "stack add child") return ok();
			if (command === "gh") return ok(topology);
			if (args.join(" ") === "branch --show-current") return ok("child\n");
			if (args.join(" ") === "rev-parse --verify refs/heads/child") return ok("abc123\n");
			return ok();
		};
		const git = createAutobranchGitGateway({ cwd: "/repo", exec });
		const provider = createGhStackAutobranchProvider({ exec, git });

		const result = await provider.addChild({
			sourceBranch: "feature",
			childBranch: "child",
			expectedSourceSha: "abc123",
			expectedChildSha: "abc123",
			initialized: false,
		});

		expect(result.type).toBe("ambiguous");
		if (result.type === "ambiguous") {
			expect(result.error).toContain("direct source-to-child topology verification failed");
		}
	});
});
