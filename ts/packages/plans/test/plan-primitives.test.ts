import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import type {
	GitBranchParams,
	GitBranchPresenceResult,
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
	NoSavedPlanAvailableError,
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatSavedPlanFileEvidence,
	isPathInside,
	normalizePlanFilePath,
	normalizeRepoOriginUrl,
	validatePlanSlug,
} from "../src/index.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("validatePlanSlug", () => {
	test("accepts specific 3-7 word kebab slugs", () => {
		for (const slug of [
			"branch-scoped-plan-extension",
			"attached-plan-command",
			"semantic-plan-persistence-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeUndefined();
		}
	});

	test("rejects invalid slug shapes", () => {
		for (const slug of [
			"",
			"Branch-Scoped-Plan",
			"branch scoped plan",
			"branch-scoped-plan.md",
			"attached-plan",
			"one-two-three-four-five-six-seven-eight",
			"implementation-plan-task",
			"branch-2026-plan-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeDefined();
		}
	});
});

describe("source branch plan path helpers", () => {
	test("normalizes repository origin URLs deterministically", () => {
		expect(normalizeRepoOriginUrl("git@github.com:owner/repo.git")).toBe("ssh://git@github.com/owner/repo");
		expect(normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git")).toBe("https://github.com/Owner/Repo");
		expect(normalizeRepoOriginUrl("https://github.com/owner/repo.git///")).toBe("https://github.com/owner/repo");
	});

	test("encodes branch names as one safe path segment", () => {
		expect(encodeBranchForPlanPath("main")).toBe("main");
		expect(encodeBranchForPlanPath("branch-contexts/add-widget")).toBe("branch-contexts---add-widget");
		expect(encodeBranchForPlanPath("feature/add widget+docs")).toBe("feature---add-widget-docs");
	});

	test("builds GitHub repo plan store repo keys from owner and repo", () => {
		const scpLike = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
		const https = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("https://github.com/owner/repo.git"));
		const mixedCaseHttps = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git"));
		const different = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/other.git"));

		expect(scpLike).toBe("gh--owner--repo");
		expect(https).toBe(scpLike);
		expect(mixedCaseHttps).toBe(scpLike);
		expect(different).toBe("gh--owner--other");
	});

	test("builds deterministic non-GitHub fallback plan store repo keys without hashes", () => {
		expect(buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@gitlab.com:Owner/Repo.git"))).toBe(
			"ssh-git-gitlab.com-Owner-Repo",
		);
		expect(buildRepoPlanStoreKey("/repo", "/repo")).toBe("repo");
	});

	test("finds the newest saved Markdown plan file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "branch-contexts/add-widget";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "older-source-plan.md", 1_700_000_000_000);
		const newestPath = await writePlanStoreFile(directoryPath, "newer-source-plan.md", 1_800_000_000_000);
		await writePlanStoreFile(directoryPath, "ignored-source-plan.txt", 1_900_000_000_000);
		const git = new FakeGitGateway({ currentBranch: sourceBranch });

		const evidence = await findLatestSavedPlanFile(unusedPi, { cwd: ROOT, planStoreRoot, git });

		expect(evidence).toMatchObject({
			slug: "newer-source-plan",
			filePath: newestPath,
			fileName: "newer-source-plan.md",
			repoKey: "gh--owner--repo",
			sourceBranch,
			branchKey: "branch-contexts---add-widget",
			directoryPath,
		});
	});

	test("reports a typed error when the local plan store directory is missing", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const git = new FakeGitGateway({ currentBranch: "main" });

		const promise = findLatestSavedPlanFile(unusedPi, { cwd: ROOT, planStoreRoot, git });
		await expect(promise).rejects.toThrow(/No local plan store directory exists[\s\S]*Create a saved plan first/);
		await expect(promise).rejects.toBeInstanceOf(NoSavedPlanAvailableError);
		await expect(promise).rejects.toMatchObject({ reason: "missing-directory" });
	});

	test("reports a typed error when no Markdown saved plans exist", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await mkdir(directoryPath, { recursive: true });
		await writeFile(join(directoryPath, "notes.txt"), "not a plan", "utf8");
		const git = new FakeGitGateway({ currentBranch: sourceBranch });

		const promise = findLatestSavedPlanFile(unusedPi, { cwd: ROOT, planStoreRoot, git });
		await expect(promise).rejects.toThrow(/No Markdown saved plan files exist[\s\S]*Create a saved plan first/);
		await expect(promise).rejects.toBeInstanceOf(NoSavedPlanAvailableError);
		await expect(promise).rejects.toMatchObject({ reason: "no-plan-files" });
	});

	test("treats the latest filename stem as a locator even when it is not a valid branch slug", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "valid-source-plan.md", 1_700_000_000_000);
		const latestPath = await writePlanStoreFile(directoryPath, "bad.md", 1_800_000_000_000);
		const git = new FakeGitGateway({ currentBranch: sourceBranch });

		const evidence = await findLatestSavedPlanFile(unusedPi, { cwd: ROOT, planStoreRoot, git });

		expect(evidence.slug).toBe("bad");
		expect(evidence.filePath).toBe(latestPath);
	});

	test("tie-breaks exact matching mtimes by filename path", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "alpha-source-plan.md", 1_800_000_000_000);
		const expectedPath = await writePlanStoreFile(directoryPath, "zeta-source-plan.md", 1_800_000_000_000);
		const git = new FakeGitGateway({ currentBranch: sourceBranch });

		const evidence = await findLatestSavedPlanFile(unusedPi, { cwd: ROOT, planStoreRoot, git });

		expect(evidence.slug).toBe("zeta-source-plan");
		expect(evidence.filePath).toBe(expectedPath);
	});
});

describe("formatSavedPlanFileEvidence", () => {
	test("reports all local plan store evidence", () => {
		const text = formatSavedPlanFileEvidence({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "branch-contexts/add-widget",
			branchKey: "branch-contexts---add-widget",
			filePath: "/plans/gh--owner--repo/branch-contexts---add-widget/branch-scoped-plan-extension.md",
			summary: "Plan the local plan store file.",
		});

		expect(text).toContain("Saved plan file in local plan store.");
		expect(text).toContain("Path: /plans/gh--owner--repo/branch-contexts---add-widget/branch-scoped-plan-extension.md");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain(`Repo root: ${ROOT}`);
		expect(text).toContain("Repo identity source: origin-url");
		expect(text).toContain("Source branch: branch-contexts/add-widget");
		expect(text).toContain("Branch path segment: branch-contexts---add-widget");
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Plan the local plan store file.");
	});
});

describe("isPathInside", () => {
	test("handles sibling prefixes correctly", () => {
		expect(isPathInside("/repo", "/repo/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo/nested/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo-other/file.md")).toBe(false);
		expect(isPathInside("/repo", "/repo2/file.md")).toBe(false);
	});
});

describe("normalizePlanFilePath", () => {
	test("strips leading @ and expands current-user home shorthand", () => {
		const scenarioPath = join(homedir(), ".claude", "plans", "where-would-we-host-mossy-lampson.md");

		expect(normalizePlanFilePath("@/tmp/my-source-plan.md")).toBe("/tmp/my-source-plan.md");
		expect(normalizePlanFilePath("~")).toBe(homedir());
		expect(normalizePlanFilePath("~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("@~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("relative-source-plan.md")).toBe("relative-source-plan.md");
	});
});

const unusedPi = { exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }) };

interface FakeGitOptions {
	currentBranch: string;
	originUrl?: string;
}

class FakeGitGateway implements GitGateway {
	private readonly currentBranchValue: string;
	private readonly originUrlValue: string;

	constructor(options: FakeGitOptions) {
		this.currentBranchValue = options.currentBranch;
		this.originUrlValue = options.originUrl ?? "git@github.com:owner/repo.git";
	}

	async repoRoot(_params: GitCwdParams): Promise<GitResult<string>> {
		return { ok: true, value: ROOT };
	}

	async optionalRepoRoot(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		return { type: "found", value: ROOT };
	}

	async currentBranch(_params: GitCwdParams): Promise<GitResult<string>> {
		return { ok: true, value: this.currentBranchValue };
	}

	async trunkBranch(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		return { type: "missing" };
	}

	async originUrl(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		return { type: "found", value: this.originUrlValue };
	}

	async headCommit(_params: GitCwdParams): Promise<GitResult<string>> {
		return { ok: true, value: "abc123" };
	}

	async validateBranchRef(_params: GitBranchParams): Promise<GitOperationResult> {
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		return { type: "absent", refName: `refs/heads/${params.branch}` };
	}

	async createBranchAtHead(_params: GitBranchParams): Promise<GitOperationResult> {
		return { ok: true };
	}

	async hasUncommittedChangesUnder(_params: GitPathParams): Promise<GitResult<boolean>> {
		return { ok: true, value: false };
	}

	async listLocalBranchTips(_params: GitCwdParams): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		return { ok: true, value: [] };
	}

	async treeOidsAtRefs(params: GitRefsPathParams): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		return { ok: true, value: Object.fromEntries(params.refs.map((ref) => [ref, null])) };
	}

	async changedPathsUnder(_params: GitRevisionRangePathParams): Promise<GitResult<readonly string[]>> {
		return { ok: true, value: [] };
	}
}

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function planStoreDirectory(planStoreRoot: string, sourceBranch: string): string {
	return join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(sourceBranch));
}

async function writePlanStoreFile(directoryPath: string, fileName: string, modifiedTimeMs: number): Promise<string> {
	await mkdir(directoryPath, { recursive: true });
	const filePath = join(directoryPath, fileName);
	await writeFile(filePath, `# ${fileName}\n`, "utf8");
	const modified = new Date(modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}
