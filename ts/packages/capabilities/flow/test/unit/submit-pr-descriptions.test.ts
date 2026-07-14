import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { ScriptedTextGenerator } from "@nseng-ai/capability-kit/text-generation/testing";
import type { ActiveOperation } from "@nseng-ai/sdk";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import { ok, type GithubPrGateway, type TextGenerator } from "../../src/submit/index.ts";
import { generateSubmitPrDescriptions } from "../../src/submit/submit-pr-descriptions.ts";

class PrewrittenDescriptionGithubPrGateway implements GithubPrGateway {
	async viewCurrentBranchPr(): Promise<never> {
		throw new Error("viewCurrentBranchPr should not be called");
	}

	async viewPr(params: { number: number }) {
		return {
			ok: true,
			value: {
				number: params.number,
				url: `https://github.com/acme/repo/pull/${params.number}`,
				title: "Prepared title",
				body: "Prepared body",
				headRefName: "feature/demo",
				baseRefName: "main",
			},
		} as const;
	}

	async getPrCommitMessages(): Promise<never> {
		throw new Error("getPrCommitMessages should not be called");
	}

	async getPrDiff(): Promise<never> {
		throw new Error("getPrDiff should not be called");
	}

	async stablePatchIdForPr(): Promise<never> {
		throw new Error("stablePatchIdForPr should not be called");
	}

	async editPr(): Promise<never> {
		throw new Error("editPr should not be called");
	}
}

const unusedTextGenerator: TextGenerator = {
	generateText: async () => {
		throw new Error("generateText should not be called");
	},
};

class GeneratedDescriptionGithubPrGateway implements GithubPrGateway {
	async viewCurrentBranchPr(): Promise<never> {
		throw new Error("viewCurrentBranchPr should not be called");
	}

	async viewPr(params: { number: number }) {
		return {
			ok: true,
			value: {
				number: params.number,
				url: `https://github.com/acme/repo/pull/${params.number}`,
				title: "Current title",
				body: "Current body",
				headRefName: "feature/gen",
				baseRefName: "main",
			},
		} as const;
	}

	async getPrCommitMessages() {
		return ok([{ headline: "Add feature" }]);
	}

	async getPrDiff() {
		return ok("diff --git a/file b/file\n+change");
	}

	async stablePatchIdForPr() {
		return ok({ patchId: "patch-1", diff: "diff --git a/file b/file\n+change" });
	}

	async editPr() {
		return ok(undefined);
	}
}

describe("generateSubmitPrDescriptions", () => {
	test("emits PR-addressed progress after PR metadata loads", async () => {
		const events: Array<{
			prNumber: number;
			state: string;
			message?: string;
		}> = [];

		const result = await generateSubmitPrDescriptions({
			cwd: "/repo",
			prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
			prewrittenMetadata: [
				{
					branch: "feature/demo",
					parentBranch: "main",
					title: "Prepared title",
					body: "Prepared body",
					commitRange: "main..feature/demo",
					promptSource: { type: "builtin" },
				},
			],
			prDescription: {
				githubPr: new PrewrittenDescriptionGithubPrGateway(),
				textGenerator: unusedTextGenerator,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				descriptorSource: flowExtensionDescriptorSource,
				env: {},
			},
			progress: {
				onItemProgress: (event) => {
					events.push(event);
				},
			},
		});

		expect(result).toMatchObject({ ok: true, prewritten: [{ label: "#12" }] });
		expect(events).toEqual([
			{ prNumber: 12, state: "active", message: "loading PR metadata" },
			{ prNumber: 12, state: "done", message: "prewritten" },
		]);
	});

	test("prewritten descriptions emit no active operations", async () => {
		const snapshots: ActiveOperation[][] = [];

		const result = await generateSubmitPrDescriptions({
			cwd: "/repo",
			prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
			prewrittenMetadata: [
				{
					branch: "feature/demo",
					parentBranch: "main",
					title: "Prepared title",
					body: "Prepared body",
					commitRange: "main..feature/demo",
					promptSource: { type: "builtin" },
				},
			],
			prDescription: {
				githubPr: new PrewrittenDescriptionGithubPrGateway(),
				textGenerator: unusedTextGenerator,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				descriptorSource: flowExtensionDescriptorSource,
				env: {},
			},
			progress: {
				onActiveOperations: (operations) => {
					snapshots.push([...operations]);
				},
			},
		});

		expect(result).toMatchObject({ ok: true });
		expect(snapshots).toEqual([]);
	});

	test("reports one model operation exactly while a description generates", async () => {
		const snapshots: ActiveOperation[][] = [];
		const textGenerator = new ScriptedTextGenerator([
			{ ok: true, text: "Generated title\n\nGenerated body" },
		]);

		const result = await generateSubmitPrDescriptions({
			cwd: "/repo",
			prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
			prDescription: {
				githubPr: new GeneratedDescriptionGithubPrGateway(),
				textGenerator,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				descriptorSource: flowExtensionDescriptorSource,
				env: { NS_DEV_PR_DESCRIPTION_MODEL: "openai-codex/gpt-5.4-mini" },
			},
			progress: {
				onActiveOperations: (operations) => {
					snapshots.push([...operations]);
				},
			},
		});

		expect(result).toMatchObject({ ok: true, generated: [{ label: "#12" }] });
		expect(snapshots).toEqual([
			[
				{
					kind: "model",
					operation: "generating PR description",
					modelRef: "openai-codex/gpt-5.4-mini",
					detail: "PR 1/1",
				},
			],
			[],
		]);
		textGenerator.assertDone();
	});

	test("a rejecting text generator still leaves the last operation snapshot empty", async () => {
		const snapshots: ActiveOperation[][] = [];
		const throwingGenerator: TextGenerator = {
			generateText: async () => {
				throw new Error("model transport failed");
			},
		};

		await expect(
			generateSubmitPrDescriptions({
				cwd: "/repo",
				prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
				prDescription: {
					githubPr: new GeneratedDescriptionGithubPrGateway(),
					textGenerator: throwingGenerator,
					git: new InMemoryGitGateway({ repoRoot: "/repo" }),
					descriptorSource: flowExtensionDescriptorSource,
					env: { NS_DEV_PR_DESCRIPTION_MODEL: "openai-codex/gpt-5.4-mini" },
				},
				progress: {
					onActiveOperations: (operations) => {
						snapshots.push([...operations]);
					},
				},
			}),
		).rejects.toThrow("model transport failed");

		expect(snapshots.length).toBeGreaterThan(0);
		expect(snapshots.at(-1)).toEqual([]);
	});
});
