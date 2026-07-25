import { describe, expect, test } from "vitest";
import { join } from "node:path";

import type {
	GitCurrentBranchResult,
	GitCwdParams,
	GitOptionalResult,
	GitResult,
} from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
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
			"/state/ns/enriched-plan",
		);
		expect(defaultPlanStoreRoot({ HOME: "/home/tester", XDG_STATE_HOME: "relative" })).toBe(
			"/home/tester/.local/state/ns/enriched-plan",
		);
	});
});

describe("writeSavedPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const planStoreRoot = makeTempDir("source-plan-store-");
		const planStoreGateway = new InMemoryPlanStoreGateway();
		const sourceBranch = "branch-contexts/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const git = new FakeGitGateway({
			currentBranch: fakeCurrentBranch(sourceBranch),
			origin: fakeOriginUrl(origin),
		});

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
		const git = new FakeGitGateway({
			currentBranch: fakeCurrentBranch(sourceBranch),
			origin: missingOriginUrl(),
		});

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
		const git = new FakeGitGateway({
			currentBranch: fakeCurrentBranch(sourceBranch),
			origin: fakeOriginUrl(origin),
		});

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
		const git = new FakeGitGateway({
			currentBranch: fakeCurrentBranch(sourceBranch),
			origin: fakeOriginUrl(origin),
		});

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
				"ns",
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
			".ns",
			"enriched-plan",
			"gh--owner--repo",
			branchKey,
			`${PLAN_SLUG}.md`,
		);
		planStoreGateway.writeFile(legacyPath, "# Legacy Plan\n");
		const git = new FakeGitGateway({
			currentBranch: fakeCurrentBranch(sourceBranch),
			origin: fakeOriginUrl("git@github.com:owner/repo.git"),
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
				"ns",
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
		const git = new FakeGitGateway({ currentBranch: { type: "detached" } });

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

const unusedPi = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};

function fakeCurrentBranch(branch: string): FakeCurrentBranch {
	return { type: "branch", branch };
}

function fakeOriginUrl(url: string): FakeOriginUrl {
	return { type: "found", url };
}

function missingOriginUrl(): FakeOriginUrl {
	return { type: "missing" };
}

type FakeCurrentBranch = { type: "branch"; branch: string } | { type: "detached" };
type FakeOriginUrl = { type: "found"; url: string } | { type: "missing" };

interface FakeGitOptions {
	repoRoot?: string;
	currentBranch?: FakeCurrentBranch;
	origin?: FakeOriginUrl;
}

class FakeGitGateway extends InMemoryGitGateway {
	readonly calls: string[] = [];
	constructor(options: FakeGitOptions = {}) {
		super({
			repoRoot: options.repoRoot ?? ROOT,
			currentBranch:
				options.currentBranch?.type === "detached"
					? { type: "detached" }
					: (options.currentBranch?.branch ?? "main"),
			originUrl:
				options.origin?.type === "missing"
					? { type: "missing" }
					: (options.origin?.url ?? "git@github.com:owner/repo.git"),
		});
	}

	override async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		return await this.trackCall("repoRoot", () => super.repoRoot(params));
	}

	override async currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult> {
		return await this.trackCall("currentBranch", () => super.currentBranch(params));
	}

	override async originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		return await this.trackCall("originUrl", () => super.originUrl(params));
	}

	private async trackCall<T>(name: string, run: () => Promise<T>): Promise<T> {
		this.calls.push(name);
		return await run();
	}
}

let tempDirCounter = 0;
function makeTempDir(prefix: string): string {
	tempDirCounter += 1;
	return `/${prefix}${tempDirCounter}`;
}
