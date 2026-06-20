import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
} from "@asdl/core/git";
import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	normalizeRepoOriginUrl,
	writeSavedPlanFile,
} from "../src/index.ts";

const PLAN_SLUG = "branch-scoped-plan-extension";
const ROOT = "/repo";
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("writeSavedPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
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
			{ cwd: ROOT, planStoreRoot, git },
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
		expect(await readFile(expectedPath, "utf8")).toBe("# Test Plan\n\nDo the work.\n");
	});

	test("falls back to real repo root identity when origin is absent", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: undefined });

		const evidence = await writeSavedPlanFile(
			unusedPi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, planStoreRoot, git },
		);

		expect(evidence.repoIdentitySource).toBe("repo-root");
		expect(evidence.repoKey).toBe(buildRepoPlanStoreKey(ROOT, ROOT));
		expect(await readFile(evidence.filePath, "utf8")).toBe("# Test Plan\n");
	});

	test("refuses to overwrite an existing local plan store file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "branch-contexts/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const filePath = join(planStoreRoot, repoKey, branchKey, `${PLAN_SLUG}.md`);
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, "# Existing Plan\n", "utf8");
		const git = new FakeGitGateway({ currentBranch: sourceBranch, originUrl: origin });

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: PLAN_SLUG, content: "# New Plan\n" },
				{ cwd: ROOT, planStoreRoot, git },
			),
		).rejects.toThrow("refusing to overwrite");

		expect(await readFile(filePath, "utf8")).toBe("# Existing Plan\n");
	});

	test("rejects invalid slug before git commands or filesystem writes", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const git = new FakeGitGateway();

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: "Bad Slug", content: "# Test Plan\n" },
				{ cwd: ROOT, planStoreRoot, git },
			),
		).rejects.toThrow("Invalid saved plan slug");
		expect(git.calls).toEqual([]);
	});

	test("rejects detached HEAD with a clear named-branch message", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const git = new FakeGitGateway({ currentBranch: undefined });

		await expect(
			writeSavedPlanFile(
				unusedPi,
				{ slug: PLAN_SLUG, content: "# Test Plan\n" },
				{ cwd: ROOT, planStoreRoot, git },
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
		if (this.currentBranchValue === undefined) {
			return { type: "detached", error: { code: "detached_head", message: "detached" } };
		}
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

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}
