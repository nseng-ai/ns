import { describe, expect, test } from "vitest";

import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { exitedResult, ScriptedCommandRunner } from "@nseng-ai/foundation/exec/testing";
import { validatePrTitlePrefix } from "../../src/submit/pr-title-prefix.ts";
import { RealBranchSubmitRepositoryGateway } from "../../src/submit/branch-submit-gateways.ts";
import type { GithubPrGateway } from "../../src/submit/github-pr-gateway.ts";
import {
	submitBranch,
	type BranchSubmitContext,
	type BranchSubmitPullRequest,
} from "../../src/submit/branch-submit.ts";

const HEAD = "b".repeat(40);
const MODEL_SELECTION = {
	provider: "openai",
	modelId: "test",
	thinking: "minimal",
} satisfies ModelSelection;
const unusedGithubPrGateway: GithubPrGateway = {
	viewCurrentBranchPr: async () => unexpectedCall("viewCurrentBranchPr"),
	viewPr: async () => unexpectedCall("viewPr"),
	getPrCommitMessages: async () => unexpectedCall("getPrCommitMessages"),
	getPrDiff: async () => unexpectedCall("getPrDiff"),
	editPr: async () => unexpectedCall("editPr"),
};
const unusedGitGateway = new InMemoryGitGateway({ repoRoot: "/repo" });
const PR: BranchSubmitPullRequest = {
	number: 12,
	url: "https://github.com/acme/repo/pull/12",
	title: "Human title",
	body: "Human prose",
	headRefName: "feature/demo",
	baseRefName: "main",
	headOid: HEAD,
};

function context(options: { existing?: boolean; createFails?: boolean } = {}) {
	const operations: string[] = [];
	let lookupCount = 0;
	let readFactsCount = 0;
	const value: BranchSubmitContext = {
		repository: {
			readFacts: async () => {
				readFactsCount += 1;
				return {
					ok: true,
					value: {
						branch: "feature/demo",
						trunk: "main",
						headOid: HEAD,
						commitHeadlines: ["Add feature"],
						diff: "diff --git a/app.ts b/app.ts\n",
					},
				};
			},
			pushExact: async ({ branch, headOid }) => {
				operations.push(`git push origin ${headOid}:refs/heads/${branch}`);
				return { ok: true, value: undefined };
			},
		},
		pullRequests: {
			findOpenByHead: async () => {
				lookupCount += 1;
				return options.existing === true || (options.createFails === true && lookupCount > 1)
					? { ok: true, value: { type: "found", pullRequest: PR } }
					: { ok: true, value: { type: "missing" } };
			},
			create: async ({ title }) => {
				operations.push(`gh pr create --title ${title}`);
				return options.createFails === true
					? { ok: false, error: { code: "create-failed", message: "GitHub unavailable" } }
					: { ok: true, value: { number: PR.number, url: PR.url } };
			},
			read: async () => ({ ok: true, value: PR }),
			edit: async () => {
				operations.push("gh pr edit");
				return { ok: true, value: undefined };
			},
		},
	};
	return {
		value,
		operations,
		get readFactsCount() {
			return readFactsCount;
		},
	};
}

function input(value: BranchSubmitContext) {
	return {
		cwd: "/repo",
		context: value,
		replaceExistingMetadata: false,
		progress: { phase: () => {}, matrix: undefined },
		prInventory: {
			githubPr: unusedGithubPrGateway,
			textGenerator: {
				generateText: async () => ({
					ok: true as const,
					text: "Generated title\n\nGenerated body",
				}),
			},
			git: unusedGitGateway,
			descriptorSource: {
				descriptor: { description: "test", points: [] },
				descriptorUrl: new URL("../support/point-manifest.ts", import.meta.url).href,
			},
			env: {
				NS_FLOW_PR_INVENTORY_PROMPT: new URL(
					"../../src/submit/prompts/pr-inventory-default.md",
					import.meta.url,
				).pathname,
			},
			modelSelection: MODEL_SELECTION,
		},
	};
}

function unexpectedCall(name: string): never {
	throw new Error(`Unexpected test call: ${name}`);
}

describe("RealBranchSubmitRepositoryGateway", () => {
	test("uses shared Git discovery and keeps branch-submit-specific reads on its runner", async () => {
		const git = new InMemoryGitGateway({
			currentBranch: "feature/demo",
			cachedOriginHeadBranch: "main",
		});
		const runner = new ScriptedCommandRunner([
			{
				command: "git",
				args: ["rev-parse", "HEAD"],
				result: exitedResult({ stdout: `${HEAD}\n`, code: 0 }),
			},
			{
				command: "git",
				args: ["log", "--format=%s", `main..${HEAD}`],
				result: exitedResult({ stdout: "Add feature\n", code: 0 }),
			},
			{
				command: "git",
				args: ["diff", `main...${HEAD}`, "--no-ext-diff"],
				result: exitedResult({ stdout: "diff --git a/app.ts b/app.ts\n", code: 0 }),
			},
		]);
		const gateway = new RealBranchSubmitRepositoryGateway(runner.runner, git);

		await expect(gateway.readFacts({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			value: {
				branch: "feature/demo",
				trunk: "main",
				headOid: HEAD,
				commitHeadlines: ["Add feature"],
				diff: "diff --git a/app.ts b/app.ts\n",
			},
		});
		expect(git.currentBranchCalls).toEqual([{ cwd: "/repo" }]);
		expect(git.cachedOriginHeadBranchCalls).toEqual([{ cwd: "/repo" }]);
		runner.assertDone();
	});

	test("translates detached HEAD and missing cached origin HEAD to stable failures", async () => {
		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const detachedRunner = new ScriptedCommandRunner([]);
		const detachedGateway = new RealBranchSubmitRepositoryGateway(
			detachedRunner.runner,
			detachedGit,
		);
		await expect(detachedGateway.readFacts({ cwd: "/repo" })).resolves.toMatchObject({
			ok: false,
			error: { code: "branch-submit-current-branch-failed" },
		});
		detachedRunner.assertDone();

		const missingTrunkGit = new InMemoryGitGateway({
			currentBranch: "feature/demo",
			cachedOriginHeadBranch: { type: "missing" },
		});
		const missingTrunkRunner = new ScriptedCommandRunner([]);
		const missingTrunkGateway = new RealBranchSubmitRepositoryGateway(
			missingTrunkRunner.runner,
			missingTrunkGit,
		);
		await expect(missingTrunkGateway.readFacts({ cwd: "/repo" })).resolves.toMatchObject({
			ok: false,
			error: { code: "branch-submit-trunk-failed" },
		});
		missingTrunkRunner.assertDone();
	});
});

describe("Flow branch submit", () => {
	test("pushes an existing PR branch at exact HEAD and preserves prose by default", async () => {
		const fixture = context({ existing: true });
		const result = await submitBranch(input(fixture.value));
		expect(result).toEqual({ type: "submitted", pullRequest: PR, metadataReplaced: false });
		expect(fixture.operations).toEqual([`git push origin ${HEAD}:refs/heads/feature/demo`]);
		expect(fixture.readFactsCount).toBe(2);
		expect(fixture.operations.join("\n")).not.toContain("gt ");
	});

	test("refuses before push when branch or HEAD drifts after metadata preparation", async () => {
		const fixture = context({ existing: true });
		let reads = 0;
		const originalReadFacts = fixture.value.repository.readFacts;
		fixture.value.repository.readFacts = async (request) => {
			reads += 1;
			const result = await originalReadFacts(request);
			if (result.ok && reads === 2)
				return { ok: true, value: { ...result.value, headOid: "c".repeat(40) } };
			return result;
		};
		const result = await submitBranch(input(fixture.value));
		expect(result).toMatchObject({ type: "failed", error: { code: "branch-submit-local-drift" } });
		expect(fixture.operations).toEqual([]);
	});

	test("recovers when a concurrent PR appears after create reports failure", async () => {
		const fixture = context({ createFails: true });
		const result = await submitBranch(input(fixture.value));
		expect(result).toEqual({ type: "submitted", pullRequest: PR, metadataReplaced: true });
		expect(fixture.operations).toEqual([
			`git push origin ${HEAD}:refs/heads/feature/demo`,
			"gh pr create --title Generated title",
		]);
	});

	test("applies a normalized title prefix when creating a branch PR", async () => {
		const fixture = context();
		const titlePrefix = validatePrTitlePrefix("  [obj:demo]  ");
		if (!titlePrefix.ok) throw new Error(titlePrefix.reason);
		const result = await submitBranch({ ...input(fixture.value), titlePrefix: titlePrefix.prefix });
		expect(result).toMatchObject({ type: "submitted", metadataReplaced: true });
		expect(fixture.operations).toContain("gh pr create --title [obj:demo] Generated title");
	});

	test("does not prefix regenerated metadata for an existing branch PR", async () => {
		const fixture = context({ existing: true });
		const titlePrefix = validatePrTitlePrefix("[obj:demo]");
		if (!titlePrefix.ok) throw new Error(titlePrefix.reason);
		await submitBranch({
			...input(fixture.value),
			replaceExistingMetadata: true,
			titlePrefix: titlePrefix.prefix,
		});
		expect(fixture.operations).toContain("gh pr edit");
		expect(fixture.operations.join("\n")).not.toContain("[obj:demo]");
	});

	test("reports a structured partial failure after push when existing PR read-back fails", async () => {
		const fixture = context({ existing: true });
		fixture.value.pullRequests.read = async () => ({
			ok: false,
			error: { code: "read-failed", message: "GitHub unavailable" },
		});
		const result = await submitBranch(input(fixture.value));
		expect(result).toMatchObject({
			type: "pushed-pr-metadata-failed",
			pullRequest: PR,
			error: { code: "read-failed" },
		});
		expect(fixture.operations[0]).toBe(`git push origin ${HEAD}:refs/heads/feature/demo`);
		expect(fixture.operations.join("\n")).not.toContain("--force");
	});
});
