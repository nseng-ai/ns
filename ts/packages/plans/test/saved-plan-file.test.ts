import { describe, expect, test } from "vitest";
import { join } from "node:path";

import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCurrentBranchResult,
	GitCwdParams,
	GitGateway,
	GitLocalBranchTip,
	GitOperationResult,
	GitOptionalResult,
	GitPathParams,
	GitRefsPathParams,
	GitResult,
	GitRevisionRangePathParams,
} from "@sdl/git";
import {
	buildRepoPlanStoreKey,
	defaultPlanStoreRoot,
	encodeBranchForPlanPath,
	normalizeRepoOriginUrl,
	writeSavedPlanFile,
} from "../src/index.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";

const PLAN_SLUG = "branch-scoped-plan-extension";
const ROOT = "/repo";
describe("defaultPlanStoreRoot", () => {
	test("uses XDG state root and ignores relative XDG values", () => {
		expect(defaultPlanStoreRoot({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/sdl/enriched-plan",
		);
		expect(defaultPlanStoreRoot({ HOME: "/home/tester", XDG_STATE_HOME: "relative" })).toBe(
			"/home/tester/.local/state/sdl/enriched-plan",
		);
	});
});

describe("writeSavedPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "branch-contexts/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: origin });

		const evidence = await writeSavedPlanFile(
			unusedPi,
			{
				slug: PLAN_SLUG,
				content: "# Test Plan\n\nDo the work.\n",
				summary: "Plan the local plan store file.",
			},
			{ cwd: ROOT, planStoreRoot, git, planStoreGateway },
		);

		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(planStoreRoot, repoKey, branchKey, `${PLAN_SLUG}.md`);

		expect(git.calls).toEqual(["repoRoot", "currentBranch", "originUrl"]);
		expect(evidence).toEqual({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch,
			branchKey,
			filePath: expectedPath,
			summary: "Plan the local plan store file.",
		});
		expect(planStoreGateway.readFile(expectedPath)).toBe("# Test Plan\n\nDo the work.\n");
	});

	test("falls back to real repo root identity when origin is absent", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "main";
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: undefined });

		const evidence = await writeSavedPlanFile(
			unusedPi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, planStoreRoot, git, planStoreGateway },
		);

		expect(evidence.repoIdentitySource).toBe("repo-root");
		expect(evidence.repoKey).toBe(buildRepoPlanStoreKey(ROOT, ROOT));
		expect(planStoreGateway.readFile(evidence.filePath)).toBe("# Test Plan\n");
	});

	test("refuses to overwrite an existing local plan store file", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "branch-contexts/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const filePath = join(planStoreRoot, repoKey, branchKey, `${PLAN_SLUG}.md`);
		planStoreGateway.writeFile(filePath, "# Existing Plan\n");
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: origin });

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: PLAN_SLUG, content: "# New Plan\n" },
				{ cwd: ROOT, planStoreRoot, git, planStoreGateway },
			),
		).rejects.toThrow("refusing to overwrite");

		expect(planStoreGateway.readFile(filePath)).toBe("# Existing Plan\n");
	});

	test("uses the XDG state root by default", async () => {
		const tempHome = makeTempDir("source-plan-home-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "branch-contexts/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: origin });

		const evidence = await writeSavedPlanFile(
			unusedPi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, env: { HOME: tempHome }, git, planStoreGateway },
		);

		expect(evidence.filePath).toBe(
			join(
				tempHome,
				".local",
				"state",
				"sdl",
				"enriched-plan",
				"gh--owner--repo",
				encodeBranchForPlanPath(sourceBranch),
				`${PLAN_SLUG}.md`,
			),
		);
		expect(planStoreGateway.readFile(evidence.filePath)).toBe("# Test Plan\n");
	});

	test("ignores legacy same-slug files when writing to the default XDG root", async () => {
		const tempHome = makeTempDir("source-plan-home-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "branch-contexts/add-widget";
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const legacyPath = join(
			tempHome,
			".sdl",
			"enriched-plan",
			"gh--owner--repo",
			branchKey,
			`${PLAN_SLUG}.md`,
		);
		planStoreGateway.writeFile(legacyPath, "# Legacy Plan\n");
		const git = new FakeGitGateway({
			currentBranch: sourceBranch,
			originUrl: "git@github.com:owner/repo.git",
		});

		const evidence = await writeSavedPlanFile(
			unusedPi,
			{ slug: PLAN_SLUG, content: "# New Plan\n" },
			{ cwd: ROOT, env: { HOME: tempHome }, git, planStoreGateway },
		);

		expect(evidence.filePath).toBe(
			join(
				tempHome,
				".local",
				"state",
				"sdl",
				"enriched-plan",
				"gh--owner--repo",
				branchKey,
				`${PLAN_SLUG}.md`,
			),
		);
		expect(planStoreGateway.readFile(evidence.filePath)).toBe("# New Plan\n");
		expect(planStoreGateway.readFile(legacyPath)).toBe("# Legacy Plan\n");
	});

	test("rejects invalid slug before git commands or filesystem writes", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const git = new FakeGitGateway();

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: "Bad Slug", content: "# Test Plan\n" },
				{ cwd: ROOT, planStoreRoot, git, planStoreGateway },
			),
		).rejects.toThrow("Invalid saved plan slug");
		expect(git.calls).toEqual([]);
	});

	test("rejects detached HEAD with a clear named-branch message", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const git = new FakeGitGateway({ currentBranch: undefined });

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: PLAN_SLUG, content: "# Test Plan\n" },
				{ cwd: ROOT, planStoreRoot, git, planStoreGateway },
			),
		).rejects.toThrow("check out a named branch");

		expect(git.calls).toEqual(["repoRoot", "currentBranch"]);
	});
});

const unusedPi = { exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }) };

interface FakeGitOptions {
	repoRoot?: string;
	currentBranch?: string | undefined;
	originUrl?: string | undefined;
}

class FakeGitGateway implements GitGateway {
	readonly calls: string[] = [];
	private readonly repoRootValue: string;
	private readonly currentBranchValue: string | undefined;
	private readonly originUrlValue: string | undefined;

	constructor(options: FakeGitOptions = {}) {
		this.repoRootValue = options.repoRoot ?? ROOT;
		this.currentBranchValue = Object.hasOwn(options, "currentBranch")
			? options.currentBranch
			: "main";
		this.originUrlValue = Object.hasOwn(options, "originUrl")
			? options.originUrl
			: "git@github.com:owner/repo.git";
	}

	async repoRoot(_params: GitCwdParams): Promise<GitResult<string>> {
		this.calls.push("repoRoot");
		return { ok: true, value: this.repoRootValue };
	}

	async optionalRepoRoot(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.calls.push("optionalRepoRoot");
		return { type: "found", value: this.repoRootValue };
	}

	async currentBranch(_params: GitCwdParams): Promise<GitCurrentBranchResult> {
		this.calls.push("currentBranch");
		if (this.currentBranchValue === undefined) return { type: "detached" };
		return { type: "branch", branch: this.currentBranchValue };
	}

	async isInsideWorkTree(_params: GitCwdParams): Promise<GitResult<boolean>> {
		this.calls.push("isInsideWorkTree");
		return { ok: true, value: true };
	}

	async trunkBranch(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.calls.push("trunkBranch");
		return { type: "missing" };
	}

	async originUrl(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.calls.push("originUrl");
		if (this.originUrlValue === undefined) {
			return { type: "missing" };
		}
		return { type: "found", value: this.originUrlValue };
	}

	async headCommit(_params: GitCwdParams): Promise<GitResult<string>> {
		this.calls.push("headCommit");
		return { ok: true, value: "abc123" };
	}

	async gitPath(params: GitPathParams): Promise<GitResult<string>> {
		this.calls.push("gitPath");
		return { ok: true, value: `${this.repoRootValue}/.git/${params.relativePath}` };
	}

	async validateBranchRef(_params: GitBranchParams): Promise<GitOperationResult> {
		this.calls.push("validateBranchRef");
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		this.calls.push("localBranchPresence");
		return { type: "absent", refName: `refs/heads/${params.branch}` };
	}

	async createBranchAtHead(_params: GitBranchParams): Promise<GitOperationResult> {
		this.calls.push("createBranchAtHead");
		return { ok: true };
	}

	async hasUncommittedChangesUnder(_params: GitPathParams): Promise<GitResult<boolean>> {
		this.calls.push("hasUncommittedChangesUnder");
		return { ok: true, value: false };
	}

	async listLocalBranchTips(
		_params: GitCwdParams,
	): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		this.calls.push("listLocalBranchTips");
		return { ok: true, value: [] };
	}

	async treeOidsAtRefs(
		params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		this.calls.push("treeOidsAtRefs");
		return { ok: true, value: Object.fromEntries(params.refs.map((ref) => [ref, null])) };
	}

	async changedPathsUnder(
		_params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>> {
		this.calls.push("changedPathsUnder");
		return { ok: true, value: [] };
	}
}

let tempDirCounter = 0;
function makeTempDir(prefix: string): string {
	tempDirCounter += 1;
	return `/${prefix}${tempDirCounter}`;
}
